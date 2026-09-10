# Claudian 채팅 모드 3단 분리 설계

- 날짜: 2026-09-10
- 대상: `github.com/YishenTu/claudian` 포크
- 상태: 설계 승인 대기

## 1. 목표

Claudian 채팅 입력창에 모드 선택기를 추가해, 한 번의 클릭으로 에이전트가 볼트에
접근하는 범위를 바꾼다.

| 모드 | 한국어 라벨 | 도구 | 볼트 접근 |
|---|---|---|---|
| `general` | 일반 | 없음 | 없음 (순수 대화) |
| `vault` | 볼트 | `Read` `Grep` `Glob` `LS` `WebSearch` `WebFetch` | 읽기 전용 |
| `agent` | 에이전트 | 전체 | 읽기 + 쓰기 (현재 동작) |

### 비목표

- 새 사이드바 뷰나 두 번째 채팅 화면을 만들지 않는다. 기존 채팅 탭 안에서 해결한다.
- 프로바이더별 실행 코드를 수정하지 않는다 (§3에서 근거).
- 일반 모드용 별도 API 직접 호출 경로를 만들지 않는다. 기존 CLI 세션을 도구 없이 쓴다.
- 모드별 모델/추론 강도 자동 변경은 하지 않는다 (사용자가 툴바에서 따로 고른다).

## 2. 배경: 현재 왜 항상 볼트를 뒤지는가

1. 볼트 폴더가 CLI의 작업 디렉터리로 그대로 넘어간다.
   `src/providers/claude/execution/ClaudeExecutionRequestEncoder.ts:149`
   → `cwd: sessionConfig.vaultWorkingDirectory`
2. 채팅 전송 경로가 도구 정책을 상수로 박아 놨다.
   `src/features/chat/controllers/InputController.ts:1024`
   → `toolPolicy: { kind: 'provider-default' }`
3. 시스템 프롬프트도 항상 볼트용으로 조립된다.
   `src/features/chat/controllers/InputController.ts:994-999`
   → `systemInstructions: { kind: 'provider-default' }`
   → `src/core/prompt/mainAgent.ts:110` `buildSystemPrompt()`가 경로 규약·파일
   조작·참조 규약 섹션을 모두 붙인다.
4. 기본 권한 모드가 `yolo`다. `src/app/settings/defaultSettings.ts:10`
   → 인코더 `:127`에서 SDK `bypassPermissions`로 번역된다. 즉 지금은 확인 없이
   볼트 파일을 쓸 수 있는 상태다.

## 3. 핵심 발견: 필요한 실행 배선이 이미 다 있다

### 3.1 도구 정책 타입이 이미 5종

`src/core/execution/ProviderExecutionRequest.ts`의 `ProviderToolPolicy`:
`passive` / `read-only` / `allow-list` / `provider-default` / `unrestricted`.

Claude 백엔드의 번역기 `ClaudeExecutionRequestEncoder.ts:293` `resolveToolPolicy()`:

- `passive` → `tools: []`, `allowedTools: new Set()` — 도구가 아예 없다.
- `read-only` → `tools: READ_ONLY_TOOLS` + `PreToolUse` 훅으로 목록 외 도구를
  `permissionDecision: 'deny'`. 이중 방어다.
  목록은 `src/core/tools/toolNames.ts:77` = `Read, Grep, Glob, LS, WebSearch, WebFetch`.
- `provider-default` → 제약 없음 (현재 동작).

즉 세 모드가 필요로 하는 런타임 동작이 이미 구현되어 있고 테스트도 걸려 있다.

### 3.2 다섯 프로바이더 전부 이미 처리한다

| 프로바이더 | `passive` 처리 | `explicit` 시스템 프롬프트 처리 |
|---|---|---|
| Claude | `ClaudeExecutionRequestEncoder.ts:293` | `:133` |
| Codex | `CodexExecutionSession.ts:1794`, `1818` | `:1787` |
| Grok | `GrokExecutionSession.ts:1329` | `:1326` |
| Pi | `PiExecutionSession.ts:500` `resolveToolProfile` | `:1537` |
| OpenCode | `OpencodeExecutionSession.ts:826` | `:836` |

따라서 **모드를 호스트(채팅 기능) 쪽 개념으로 정의하고 기존 `toolPolicy` +
`systemInstructions`로 투사하면 프로바이더 코드는 한 줄도 건드리지 않는다.**
이게 이 설계의 중심 결정이다.

### 3.3 대화 중 모드 전환도 이미 안전

`src/providers/claude/execution/ClaudeExecutionStrategies.ts:201`:
`restartKey`가 달라지면 현재 쿼리를 닫고 새로 연다. `restartKey`는
`ClaudeExecutionRequestEncoder.ts:217`에서 `systemPrompt`, `tools`,
`disallowedTools`, 훅 유무를 포함해 만들어진다. 모드를 바꾸면 이 세 값이 모두
바뀌므로 자동으로 세션이 재시작되고, `resume: sessionId`는 그대로 넘어가므로
대화 히스토리는 유지된다. 추가 구현이 필요 없다.

### 3.4 정정: 기존 `ModeSelector`는 재사용할 수 없다

`src/core/providers/types.ts:240` `ProviderModeSelectorConfig`와
`src/features/chat/ui/InputToolbar.ts:154` `ModeSelector`가 비어 있어서 처음엔
이 슬롯을 채우려 했으나, 코드를 읽어 보니 두 가지가 맞지 않는다.

1. **2지 토글 전용이다.** `updateDisplay()`가 `options.length !== 2`면 숨기고,
   `toggle()`은 두 값을 왕복만 한다. 3단이 안 된다.
2. **프로바이더 소유 개념이다.** 값이 `getModeSelector(settings)`로 프로바이더
   UI 설정에서 나온다. 우리 채팅 모드는 프로바이더 중립이어야 한다 (§3.2).

그래서 **새 컴포넌트 `ChatModeSelector`를 호스트 소유로 추가**한다. 기존
`ModeSelector`는 그대로 둔다 (다른 프로바이더가 쓸 여지가 있는 확장점).

## 4. 아키텍처

```
[ChatModeSelector]  일반 | 볼트 | 에이전트     ← 새 UI (호스트 소유)
        │ onChatModeChange(mode)
        ▼
[TabProviderState.updateTabChatMode]           ← 탭 상태 + 영속화
        │
        ▼
[InputController.buildSubmission]              ← 단일 투사 지점
        │  chatMode → CHAT_MODE_PROJECTION[mode]
        ├──→ toolPolicy:         passive | read-only | provider-default
        └──→ systemInstructions: explicit | provider-default(+dynamicSection)
        ▼
[ChatExecutionCoordinator] → [ProviderExecutionRequest] → 프로바이더 백엔드 (무수정)
```

투사 표는 한 곳에만 둔다 — `src/features/chat/state/chatMode.ts` (신규):

```ts
export type ChatMode = 'general' | 'vault' | 'agent';

export const CHAT_MODES: readonly ChatMode[] = ['general', 'vault', 'agent'];

export function projectChatModeToolPolicy(mode: ChatMode): ProviderToolPolicy {
  switch (mode) {
    case 'general': return { kind: 'passive' };
    case 'vault':   return { kind: 'read-only' };
    case 'agent':   return { kind: 'provider-default' };
  }
}
```

## 5. 컴포넌트별 변경

### 5.1 신규 파일

| 파일 | 역할 |
|---|---|
| `src/features/chat/state/chatMode.ts` | `ChatMode` 타입, 상수, 도구 정책 투사, 값 정규화 |
| `src/features/chat/ui/ChatModeSelector.ts` | 3지 세그먼트 알약 UI |
| `src/core/prompt/generalChat.ts` | 일반 모드 시스템 프롬프트 조립 |
| `src/core/prompt/vaultSearch.ts` | 볼트 모드 동적 섹션 문구 |

### 5.2 수정 파일

| 파일 | 변경 |
|---|---|
| `src/core/types/settings.ts:127` | `ClaudianSettings`에 `defaultChatMode: ChatMode \| 'last-used'`, `lastUsedChatMode: ChatMode` 추가 |
| `src/app/settings/defaultSettings.ts:7` | 기본값 `defaultChatMode: 'last-used'`, `lastUsedChatMode: 'general'` |
| `src/features/chat/tabs/TabProviderState.ts:32` | `TabProviderSettings`에 `chatMode: string`. `updateTabPermissionMode`(`:438`)를 본떠 `updateTabChatMode` 추가 |
| `src/features/chat/ui/InputToolbar.ts:723` | `createInputToolbar`에서 `ChatModeSelector` 생성·반환. `ToolbarCallbacks`에 `onChatModeChange` 추가 |
| `src/features/chat/tabs/types.ts:119` | `TabUIComponents`에 `chatModeSelector` |
| `src/features/chat/tabs/runtime/TabRuntimeUI.ts:440` | UI 컴포넌트 배선 + 리프레시 지점 3곳에 `updateDisplay()` 추가 |
| `src/features/chat/controllers/InputController.ts:994,1024` | **핵심 스위치.** 위 두 상수를 모드 투사로 교체 |
| `src/core/types/chat.ts:100` | `ChatMessage`에 `chatMode?: ChatMode` |
| `src/features/chat/rendering/MessageRenderer.ts` | 이전 사용자 메시지와 `chatMode`가 다르면 구분선 렌더 |
| `src/features/settings/ClaudianSettings.ts` | 기본 모드 드롭다운 1개 추가 |
| `src/style/components/input.css` | 세그먼트 알약 스타일 (Obsidian CSS 변수만 사용) |
| `src/i18n/locales/*.json` (10개) | 라벨·설명·구분선 문구 키 |

**변경 파일 12개 + 신규 4개.** 프로바이더 디렉터리와 실행 백엔드는 무수정.

### 5.3 상태와 영속화

- **탭 런타임 상태**: `TabProviderSettings.chatMode`. 탭마다 독립. 왼쪽 탭은 일반
  대화, 오른쪽 탭은 볼트 조사를 동시에 할 수 있다.
- **`PROJECTION_KEYS`에 넣지 않는다.** `src/core/providers/ProviderSettingsCoordinator.ts:23`의
  이 목록은 프로바이더별로 값을 따로 기억하는 키들이다. 채팅 모드는 프로바이더가
  바뀌어도 유지되어야 하므로 플러그인 설정 최상위(`lastUsedChatMode`)에 저장한다.
- **새 탭 초기값**: `defaultChatMode`가 `'last-used'`면 `lastUsedChatMode`, 아니면
  고정값. 모드를 바꿀 때마다 `lastUsedChatMode`를 갱신한다.

## 6. 시스템 프롬프트

### 6.1 일반 모드 — `kind: 'explicit'`

볼트용 프롬프트를 아예 태우지 않는다. `src/core/prompt/mainAgent.ts:110`의 섹션
중 볼트와 무관한 것만 재사용한다:

- `getUserMessageContext()` — 구조화 컨텍스트 블록 취급 규칙 (재사용)
- `getCustomInstructions(settings.systemPrompt)` — 사용자 지정 지침 (재사용)
- 신규 지시문: 이 대화에는 볼트 접근이 없으니 일반 지식으로 답하고, 노트를 읽은
  척하거나 파일 경로를 인용하지 말 것. 볼트 내용이 필요하면 사용자에게
  볼트 모드 전환이나 `@` 첨부를 안내할 것.

제외: 경로 규약, 파일 조작, 참조 규약, 미디어 폴더 컨텍스트, 런타임 볼트 경로.

인코더가 `explicit` 경로에 `EXPLICIT_PROTOCOL_INSTRUCTIONS`
(`ClaudeExecutionRequestEncoder.ts:66`)를 자동으로 덧붙이므로 호스트 도구 정책
준수 문구는 따로 쓰지 않는다.

**부수 효과(의도된 이득)**: 도구 스키마 + 볼트 프롬프트가 통째로 빠져 입력 토큰이
크게 줄고 첫 토큰이 빨라진다.

### 6.2 볼트 모드 — `kind: 'provider-default'` + 동적 섹션

기존 볼트 프롬프트를 유지하고 `dynamicSections`에 한 단락을 추가한다. 이 배선은
instruction 모드가 이미 쓰는 경로다 (`InputController.ts:994`).

- 답하기 전에 `Grep`/`Glob`으로 볼트를 실제로 검색할 것. 기억이나 추측으로
  답하지 말 것.
- 근거가 된 노트를 위키링크로 인용할 것.
- 볼트에 근거가 없으면 "볼트에서 찾지 못했다"고 명시하고, 일반 지식으로 답할
  때는 그 사실을 구분해 밝힐 것.
- 이 대화는 읽기 전용이다. 파일 수정 요청은 에이전트 모드 전환을 안내할 것.

### 6.3 에이전트 모드

현재와 완전히 동일. 회귀 위험 없음.

## 7. 모드 전환 UX

- **전환 시점**: 대화 중 언제든 가능. 다음 전송부터 적용된다.
- **세션**: §3.3대로 `restartKey` 변화가 쿼리를 재시작하고 `resume`으로 히스토리를
  잇는다. 사용자에게는 끊김이 보이지 않는다.
- **구분선**: 사용자 메시지의 `chatMode`가 직전 사용자 메시지와 다르면 메시지
  흐름에 "볼트 모드로 전환" 같은 얇은 구분선을 그린다. 가짜 시스템 메시지를
  넣지 않고 메시지 필드로 판정하므로 영속화·리와인드·재생과 자연히 맞는다.
- **웜 세션**: `WarmExecutionPool`이 미리 띄워 둔 세션과 모드가 다르면 첫 전송에서
  재시작이 한 번 일어난다. 기존 `restartKey` 경로라 정상 동작이며, 예열 효과만
  한 번 놓친다. 최적화는 하지 않는다(YAGNI).

## 8. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 일반 모드에서 `@mention`으로 노트 첨부 | **허용.** 첨부 내용은 도구가 아니라 프롬프트 인코딩 경로(`encodePrompt`)로 들어간다. "에이전트가 스스로 볼트를 뒤지지 않는다"는 뜻이지 "내가 준 노트도 못 본다"는 뜻이 아니다. |
| 일반 모드에서 에디터 선택 영역·캔버스·브라우저 컨텍스트 | 같은 이유로 허용 |
| 일반 모드에서 도구가 필요한 슬래시 커맨드/스킬 실행 | 전송 전에 Notice로 안내하고 차단. 자동 승격은 하지 않는다 (사용자가 모드를 고른 의도를 덮지 않는다) |
| 볼트 모드에서 파일 수정 요청 | `read-only` 훅이 도구 레벨에서 거부하고, 프롬프트가 모드 전환을 안내한다 |
| 인라인 편집 (`/inline-edit`) | 채팅 모드와 무관. 별도 `AuxiliarySessionController` 경로를 쓰므로 손대지 않는다 |
| 제목 자동 생성 | 이미 `passive`로 도는 보조 세션. 무관 |
| Collab 모드 | 파일 쓰기가 본질인 기능이므로 에이전트 모드를 요구한다. Collab 패널 진입 시 모드를 에이전트로 올리도록 안내 |
| 대화 재개(resume)한 옛 대화 | `chatMode`가 없는 메시지는 `agent`로 간주 (하위 호환) |
| 이미지 첨부 | 모든 모드에서 그대로 동작 |

## 9. 테스트 계획

기존 테스트 파일을 확장한다 (`tests/unit/features/chat/...`가 이미 있다).

**단위**
- `chatMode.test.ts` (신규): 세 모드 → 도구 정책 투사, 잘못된 값 정규화
- `InputController.test.ts` (기존 확장): 모드별로 `buildSubmission`이 내는
  `toolPolicy`와 `systemInstructions.kind`가 맞는지. 일반 모드에서 `@mention`
  내용이 여전히 프롬프트에 실리는지
- `InputToolbar.test.ts` (기존 확장): 세그먼트 3개 렌더, 클릭 시 콜백, 활성 표시
- `generalChat.test.ts` (신규): 조립된 프롬프트에 볼트 경로·파일 조작 섹션이
  들어가지 않는지 (문자열 부재 단정)

**통합**
- 일반 모드 전송 → 인코더가 만든 SDK 옵션에 `tools: []`가 들어가는지
- 볼트 모드 전송 → `tools`가 `READ_ONLY_TOOLS`이고 `PreToolUse` 훅이 붙는지,
  훅이 `Write`를 거부하는지
- 모드 전환 → `restartKey`가 바뀌고 `resume` 세션 ID는 유지되는지

**수동 확인 (볼트에 설치 후)**
1. 일반 모드에서 "내 볼트에서 X 찾아줘" → 볼트를 뒤지지 않고 안내해야 한다
2. 볼트 모드에서 같은 질문 → Grep 실행 + 위키링크 인용
3. 볼트 모드에서 "이 노트 고쳐줘" → 거부 + 모드 전환 안내
4. 에이전트 모드에서 기존 동작 회귀 없음
5. 일반 → 볼트 전환 시 앞선 대화 맥락 유지 + 구분선 표시
6. 탭 두 개에 서로 다른 모드, Obsidian 재시작 후 모드 복원

## 10. 작업 순서와 배포

1. 업스트림 포크 → `<repo>`에 클론
2. `npm install` → `npm run build`로 **손대기 전 기준선 빌드 확인**
3. 5.1의 순수 로직(`chatMode.ts`, 프롬프트 2개)부터 테스트와 함께 작성
4. `InputController` 투사 지점 교체 + 테스트
5. 상태·영속화 (`TabProviderState`, 설정)
6. UI (`ChatModeSelector`, CSS, i18n 10개 로케일)
7. 구분선 렌더링
8. `npm run build && npm test && npm run lint` 전부 통과
9. 산출물(`main.js`, `manifest.json`, `styles.css`)을 지정 볼트의
   `.obsidian/plugins/claudian/`에 복사 → §9 수동 확인
10. 통과 후 업스트림 PR 여부 결정

## 11. 위험

| 위험 | 완화 |
|---|---|
| 업스트림이 빠르게 움직여 리베이스 충돌 | 변경을 12개 파일·신규 4개로 가두고, 신규 파일에 로직을 몰았다. 충돌 표면이 좁다 |
| 일반 모드 프롬프트가 볼트 프롬프트와 어긋남 | 공통 섹션을 `mainAgent.ts`에서 재사용(복사 금지). 부재 단정 테스트로 고정 |
| 프로바이더별 `passive` 해석 차이 | Claude에서 먼저 검증하고, 나머지 4개는 §3.2 경로가 이미 있으므로 수동 확인만 |
| 3단이 툴바에서 공간을 먹음 | `InputToolbarLayoutController`가 이미 폭 대응을 한다. 좁은 폭에서는 아이콘만 표시 |

---

## 부록 A: 승인 후 코드 확인에서 나온 정정

계획 작성 전 저장·영속화 경로를 끝까지 읽고 확인한 결과, §5.3과 §7의 두 가지
전제가 사실과 달랐다. 아래가 유효한 설계이며 해당 절을 대체한다.

### A.1 `TabProviderSettings`는 탭별이 아니다 (§5.3 대체)

`src/features/chat/tabs/TabProviderState.ts:183` `updateTabProviderSettings()`는
`plugin.mutateSettings()`로 **전역 플러그인 설정**에 쓴다. 프로바이더별로 값을
투사할 뿐, 탭별 저장소가 아니다. 즉 `permissionMode`·`serviceTier`는 모든 탭이
공유한다. 여기에 `chatMode`를 넣으면 탭별 독립이 깨진다.

**대체 설계** — 코드베이스가 이미 쓰는 탭별 필드 패턴(`draftModel`)을 따른다:

- `AssembledTabRuntime.chatMode: ChatMode` — 탭 런타임의 가변 필드
  (`src/features/chat/tabs/types.ts:201`의 `draftModel` 바로 옆). 탭별 독립 ✓
- `ClaudianSettings.lastUsedChatMode: ChatMode` — 전역 1개. 새 탭의 초기값.
- `ClaudianSettings.defaultChatMode: ChatMode | 'last-used'` — 설정 드롭다운.
- 모드를 바꾸면 탭 필드를 갱신하고 `lastUsedChatMode`도 함께 저장한다.

결과: 탭 두 개가 서로 다른 모드를 동시에 유지하고, 재시작 후 모든 탭은
`lastUsedChatMode`로 열린다. 대화별 모드 복원은 A.2 때문에 별도 단계로 뺀다.

### A.2 메시지는 Claudian이 저장하지 않는다 (§7 구분선 범위 축소)

`src/core/bootstrap/SessionStorage.ts`는 세션 **메타데이터**만 저장한다
(`SessionMetadata`: 제목, `selectedModel`, `sessionId`, 사용량 등). 메시지 본문은
프로바이더의 자체 트랜스크립트에서 재구성된다
(`src/providers/claude/history/ClaudeConversationHistoryService.ts`).

따라서 `ChatMessage.chatMode`는 **현재 세션 동안만 살아 있고 재시작 후 사라진다.**

**대체 설계**:

- 구분선은 현재 세션 안에서만 표시한다. 재시작 후 과거 대화를 다시 열면 구분선이
  없다. 모드 자체는 정상 동작하므로 기능 손실이 아니라 표시상의 한계다.
- 대화별 모드 영속화가 필요하면 `selectedModel`이 사는 자리
  (`Conversation.chatMode` + `SessionMetadata` 직렬화 + `ConversationRepository`
  생성·수정 경로)에 필드를 추가해야 한다. 파일 8개가 더 늘고 마이그레이션이
  붙으므로 **선택 단계(Phase 6)로 분리**하고, Phase 5까지로 기능은 완결된다.

### A.3 확인된 사실 (변경 없음)

- 채팅 세션은 `nativePersistence: 'enabled'`
  (`src/features/chat/execution/ChatExecutionCoordinator.ts:332`)이므로,
  `passive`일 때 `thinking`/`effort`를 제거하는 인코더 분기
  (`ClaudeExecutionRequestEncoder.ts:198`)에 걸리지 않는다. 일반 모드에서도
  추론 강도가 유지된다.
- `InputControllerDeps`(`InputController.ts:95`)는 이미 `getTabProviderId?:
  () => ProviderId` 같은 선택적 게터 패턴을 쓴다. `getChatMode?: () => ChatMode`를
  같은 방식으로 추가하고 `TabRuntimeControllers.ts:340`에서 배선한다.
- 프롬프트 섹션 함수들(`getUserMessageContext`, `getCustomInstructions`)은
  `mainAgent.ts`에서 모듈 내부 함수다. 재사용을 위해 `export`로 바꾼다.
- 툴바 스타일은 `src/style/toolbar/*.css`에 파일별로 있고 `src/style/index.css`
  27-31행에서 `@import`한다. 새 파일 `chat-mode-selector.css`를 같은 방식으로 붙인다.
