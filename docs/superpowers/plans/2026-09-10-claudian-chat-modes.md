# Claudian 채팅 모드 3단 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claudian 채팅 툴바에 `일반 / 볼트 / 에이전트` 3단 모드 선택기를 추가해, 에이전트가 볼트에 접근하는 범위를 클릭 한 번으로 바꾼다.

**Architecture:** 모드는 호스트(채팅 기능) 소유 개념이다. 기존 `ProviderToolPolicy`(`passive` / `read-only` / `provider-default`)와 `ProviderSystemInstructions`(`explicit` / `provider-default`)로 투사하기 때문에 프로바이더 실행 코드는 수정하지 않는다. 투사는 `InputController.createExecutionSubmission` 한 곳에서만 일어난다. 모드 값은 탭 런타임의 가변 필드(`draftModel`과 같은 자리)에 살고, 새 탭의 초기값은 전역 설정 `lastUsedChatMode`에서 온다.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild, Jest (`ts-jest`), ESLint, Stylelint. Node 24.16.0 (`.node-version`), npm.

**Spec:** `docs/superpowers/specs/2026-09-10-claudian-chat-modes-design.md` (부록 A의 정정이 §5.3·§7을 대체한다 — 반드시 부록까지 읽을 것)

## Global Constraints

- Node 24.16.0 (`.node-version`). 패키지 매니저는 `npm` (`package-lock.json`이 정본. `bun.lock`이 함께 있지만 bun은 이 환경에 설치되어 있지 않다).
- 프로바이더 디렉터리(`src/providers/**`)와 실행 백엔드(`src/core/execution/**`)는 **수정하지 않는다.** 수정이 필요해 보이면 설계가 틀린 것이므로 멈추고 보고한다.
- 레이어 방향: `features` → `core`를 import한다. `core`가 `features`를 import하면 안 된다. 그래서 `ChatMode` 타입은 `src/core/types/ChatMode.ts`에 두고, 도구 정책 투사는 `src/features/chat/state/`에 둔다.
- 모드 식별자 문자열은 정확히 `'general'`, `'vault'`, `'agent'`다. 표시 라벨은 반드시 i18n `t()`를 통한다. 하드코딩된 사용자 표시 문자열 금지.
- **파일 이름 (`AGENTS.md:104` + `eslint.config.mjs`의 `local/file-naming` 규칙이 강제한다):** 모듈의 지배적 export 이름을 그대로 `PascalCase.ts`로 쓴다. 지배적 export가 없는 유틸 묶음만 `camelCase.ts`다. 규칙은 camelCase 파일명이 그 파일명의 PascalCase와 **똑같은 이름의 export 선언**을 가지면 `conceptMismatch` 에러를 낸다. 그래서:
  - `src/core/types/ChatMode.ts` — `export type ChatMode`을 가지므로 PascalCase 필수
  - `src/features/chat/state/ChatModeProjection.ts` — `export interface ChatModeProjection`을 가지므로 PascalCase 필수
  - `src/features/chat/state/tabChatMode.ts` — `getTabChatMode`/`setTabChatMode`만 export하므로 camelCase 정상
  - `src/core/prompt/generalChat.ts`, `vaultSearch.ts` — 파일명과 같은 이름의 export가 없으므로 camelCase 정상
  - 테스트는 소스 이름을 그대로 미러링한다: `ChatMode.ts` → `ChatMode.test.ts`
  **이 규칙을 `eslint-disable`로 침묵시키지 말 것.** 규칙이 울리면 파일 이름이 틀린 것이다.
- import 경로: `AGENTS.md:106`이 "깊은 상대경로보다 `@/` 별칭을 선호한다"고 정한다. 2단계 이상 올라가는 경로(`../../..`)는 `@/`로 쓴다. 같은 디렉터리나 한 단계(`./x`, `../x`)는 상대경로를 유지한다. `@/`는 `tsconfig.json` paths와 `jest.config.js` moduleNameMapper에 배선되어 있고 src 파일 784개 중 298개가 이미 쓰고 있다.
- 스타일은 Obsidian CSS 변수(`var(--text-muted)`, `var(--background-modifier-border)`, `var(--interactive-accent)` 등)만 쓴다. 색상 리터럴 금지.
- 테스트 import 별칭: 소스는 `@/`, 테스트 헬퍼는 `@test/` (`jest.config.js`에 설정되어 있다).
- 커밋 메시지는 Conventional Commits(`feat:`, `test:`, `refactor:`, `style:`, `chore:`).
- 각 태스크 마지막에 커밋한다. 태스크 하나 = 커밋 하나 이상.
- **모든 커밋 메시지 마지막 줄은 정확히 아래여야 한다** (빈 줄 하나 뒤에):

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

  계획 안의 `git commit -m "..."` 예시들은 이 줄을 생략하고 있다. 실제 커밋에는 반드시 넣는다. 예:

  ```bash
  git commit -m "feat: add ChatMode type with normalization and initial-mode resolution" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  ```

## 파일 구조

**신규**

| 파일 | 책임 |
|---|---|
| `src/core/types/ChatMode.ts` | `ChatMode` 타입, 상수, 타입 가드, 정규화, 초기값 해석. 의존성 없음 |
| `src/core/prompt/generalChat.ts` | 일반 모드 시스템 프롬프트 조립 |
| `src/core/prompt/vaultSearch.ts` | 볼트 모드 동적 섹션 문구 |
| `src/features/chat/state/ChatModeProjection.ts` | 모드 → `toolPolicy` + `systemInstructions` 투사 |
| `src/features/chat/state/tabChatMode.ts` | 탭 모드 읽기/쓰기 (`getTabChatMode` / `setTabChatMode`) |
| `src/features/chat/ui/ChatModeSelector.ts` | 3지 세그먼트 알약 UI |
| `src/style/toolbar/chat-mode-selector.css` | 세그먼트 스타일 |
| `tests/unit/core/types/ChatMode.test.ts` | 타입 가드·정규화·초기값 |
| `src/style/features/chat-mode-divider.css` | 모드 전환 구분선 스타일 |
| `tests/unit/core/prompt/generalChat.test.ts` | 일반 프롬프트 (볼트 섹션 부재 단정 포함) |
| `tests/unit/core/prompt/vaultSearch.test.ts` | 볼트 동적 섹션 |
| `tests/unit/features/chat/state/tabChatMode.test.ts` | 탭 모드 읽기/쓰기 |
| `tests/unit/features/chat/state/ChatModeProjection.test.ts` | 투사 |
| `tests/unit/features/chat/ui/ChatModeSelector.test.ts` | UI |
| `tests/unit/features/chat/rendering/MessageRenderer.test.ts` | 구분선 (없으면 생성) |

**수정**

| 파일 | 변경 |
|---|---|
| `src/core/types/index.ts` | `chatMode.ts` 배럴 export |
| `src/core/types/settings.ts` | `defaultChatMode`, `lastUsedChatMode` 필드 |
| `src/app/settings/defaultSettings.ts` | 두 필드 기본값 |
| `src/core/prompt/mainAgent.ts` | `getUserMessageContext`, `getCustomInstructions`를 `export` |
| `src/features/chat/tabs/types.ts` | `AssembledTabRuntime.chatMode`, `TabProviderContext`에 `chatMode` 추가, `TabUIComponents.chatModeSelector` |
| `src/features/chat/tabs/runtime/TabRuntimeShell.ts` | 탭 생성 시 `chatMode` 초기화 + 게터/세터 |
| `src/features/chat/tabs/TabRuntimeFactory.ts` | `chatMode` 게터/세터 위임 |
| `src/features/chat/ui/InputToolbar.ts` | `ToolbarCallbacks`에 `getChatMode`/`onChatModeChange`, `createInputToolbar`에서 `ChatModeSelector` 생성 |
| `src/features/chat/tabs/runtime/TabRuntimeUI.ts` | 셀렉터 배선 + 리프레시 |
| `src/features/chat/tabs/runtime/TabRuntimeControllers.ts` | `InputController`에 `getChatMode` 주입 |
| `src/features/chat/controllers/InputController.ts` | **핵심 스위치** (`toolPolicy`·`systemInstructions`) |
| `src/features/chat/rendering/MessageRenderer.ts` | 모드 전환 구분선 |
| `src/core/types/chat.ts` | `ChatMessage.chatMode?` |
| `src/features/settings/ClaudianSettings.ts` | 기본 모드 드롭다운 |
| `src/style/index.css` | 새 CSS `@import` |
| `src/i18n/locales/*.json` (10개) | 라벨·설명·공지 문구 |
| `tests/unit/features/chat/ui/InputToolbar.test.ts` | 셀렉터 생성 단정 |
| `tests/unit/features/chat/controllers/InputController.test.ts` | 투사 단정 |
| `tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts` | 인코더 계약 회귀 (Task 14) |

---

### Task 1: 포크·클론·기준선 확보

손대기 전에 빌드와 테스트가 원래 통과하는지 확인한다. 나중에 "내가 깼나 원래 깨졌나"를 구분하기 위한 기준선이다.

**Files:**
- Create: `/Users/smdjoo/Documents/03.Project/Jcaludian/claudian/` (클론)

**Interfaces:**
- Consumes: 없음
- Produces: 이후 모든 태스크의 작업 디렉터리 `~/Documents/03.Project/Jcaludian/claudian`

- [ ] **Step 1: 업스트림 포크**

```bash
gh repo fork YishenTu/claudian --clone=false
```

기대: `smdjoo-stack/claudian` 생성. 이미 있으면 "already exists" 메시지가 나오는데 그대로 진행한다.

- [ ] **Step 2: 클론 + 업스트림 원격 추가**

```bash
cd /Users/smdjoo/Documents/03.Project/Jcaludian
gh repo clone smdjoo-stack/claudian
cd claudian
git remote add upstream https://github.com/YishenTu/claudian.git
git remote -v
```

기대: `origin`은 `smdjoo-stack/claudian`, `upstream`은 `YishenTu/claudian`.

- [ ] **Step 3: 의존성 설치**

```bash
cd /Users/smdjoo/Documents/03.Project/Jcaludian/claudian
node -v
npm install
```

기대: `node -v`가 v24.x. `npm install` 완료.

- [ ] **Step 4: 기준선 빌드·테스트·린트**

```bash
npm run build && npm test && npm run lint
```

기대: 셋 다 통과. **하나라도 실패하면 실패 내용을 기록하고 멈춘다.** 기존 실패를 안고 시작하면 이후 판단이 불가능하다.

- [ ] **Step 5: 작업 브랜치 생성**

```bash
git checkout -b feat/chat-modes
git log --oneline -1
```

- [ ] **Step 6: 스펙과 계획을 저장소로 복사하고 커밋**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /Users/smdjoo/Documents/03.Project/Jcaludian/docs/superpowers/specs/2026-09-10-claudian-chat-modes-design.md docs/superpowers/specs/
cp /Users/smdjoo/Documents/03.Project/Jcaludian/docs/superpowers/plans/2026-09-10-claudian-chat-modes.md docs/superpowers/plans/
git add docs/superpowers
git commit -m "docs: add chat mode design spec and implementation plan"
```

---

### Task 2: `ChatMode` 타입과 정규화

의존성이 하나도 없는 순수 모듈부터 시작한다.

**Files:**
- Create: `src/core/types/ChatMode.ts`
- Create: `tests/unit/core/types/ChatMode.test.ts`
- Modify: `src/core/types/index.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type ChatMode = 'general' | 'vault' | 'agent'`
  - `const CHAT_MODES: readonly ChatMode[]`
  - `const FALLBACK_CHAT_MODE: ChatMode` (= `'general'`)
  - `type ChatModePreference = ChatMode | 'last-used'`
  - `isChatMode(value: unknown): value is ChatMode`
  - `normalizeChatMode(value: unknown, fallback?: ChatMode): ChatMode`
  - `resolveInitialChatMode(preference: unknown, lastUsed: unknown): ChatMode`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/core/types/ChatMode.test.ts`:

```ts
import {
  CHAT_MODES,
  FALLBACK_CHAT_MODE,
  isChatMode,
  normalizeChatMode,
  resolveInitialChatMode,
} from '@/core/types/ChatMode';

describe('chatMode', () => {
  it('exposes exactly three modes in display order', () => {
    expect(CHAT_MODES).toEqual(['general', 'vault', 'agent']);
  });

  it('falls back to general', () => {
    expect(FALLBACK_CHAT_MODE).toBe('general');
  });

  it('recognizes valid modes', () => {
    expect(isChatMode('general')).toBe(true);
    expect(isChatMode('vault')).toBe(true);
    expect(isChatMode('agent')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isChatMode('Vault')).toBe(false);
    expect(isChatMode('last-used')).toBe(false);
    expect(isChatMode('')).toBe(false);
    expect(isChatMode(undefined)).toBe(false);
    expect(isChatMode(null)).toBe(false);
    expect(isChatMode(2)).toBe(false);
  });

  it('normalizes unknown values to the fallback', () => {
    expect(normalizeChatMode('vault')).toBe('vault');
    expect(normalizeChatMode('nope')).toBe('general');
    expect(normalizeChatMode(undefined, 'agent')).toBe('agent');
  });

  it('resolves last-used preference to the remembered mode', () => {
    expect(resolveInitialChatMode('last-used', 'vault')).toBe('vault');
    expect(resolveInitialChatMode('last-used', 'garbage')).toBe('general');
  });

  it('resolves a pinned preference to that mode', () => {
    expect(resolveInitialChatMode('agent', 'vault')).toBe('agent');
  });

  it('falls back to the remembered mode when the preference is garbage', () => {
    expect(resolveInitialChatMode('garbage', 'vault')).toBe('vault');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/core/types/ChatMode.test.ts
```

기대: FAIL — `Cannot find module '@/core/types/ChatMode'`.

- [ ] **Step 3: 구현**

`src/core/types/ChatMode.ts`:

```ts
/**
 * Host-owned chat mode. Decides how much of the Vault the agent may touch.
 *
 * Provider backends never see this value; the chat feature projects it into a
 * `ProviderToolPolicy` and `ProviderSystemInstructions` at submission time.
 */
export type ChatMode = 'general' | 'vault' | 'agent';

/** Display order in the composer's mode selector. */
export const CHAT_MODES: readonly ChatMode[] = ['general', 'vault', 'agent'];

/** Used whenever a stored or incoming value cannot be trusted. */
export const FALLBACK_CHAT_MODE: ChatMode = 'general';

/** Settings-level choice: a pinned mode, or "reuse whatever was last picked". */
export type ChatModePreference = ChatMode | 'last-used';

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && (CHAT_MODES as readonly string[]).includes(value);
}

export function normalizeChatMode(
  value: unknown,
  fallback: ChatMode = FALLBACK_CHAT_MODE,
): ChatMode {
  return isChatMode(value) ? value : fallback;
}

/** Resolves the mode a freshly opened tab starts in. */
export function resolveInitialChatMode(preference: unknown, lastUsed: unknown): ChatMode {
  const remembered = normalizeChatMode(lastUsed);
  return preference === 'last-used'
    ? remembered
    : normalizeChatMode(preference, remembered);
}
```

- [ ] **Step 4: 배럴 export 추가**

`src/core/types/index.ts`의 `export { type ProviderId } from './provider';` 바로 위에 추가:

```ts
export {
  CHAT_MODES,
  type ChatMode,
  type ChatModePreference,
  FALLBACK_CHAT_MODE,
  isChatMode,
  normalizeChatMode,
  resolveInitialChatMode,
} from './ChatMode';
```

- [ ] **Step 5: 통과 확인**

```bash
npm run test:unit -- tests/unit/core/types/ChatMode.test.ts
npm run typecheck
```

기대: PASS, 타입 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/core/types/ChatMode.ts src/core/types/index.ts tests/unit/core/types/ChatMode.test.ts
git commit -m "feat: add ChatMode type with normalization and initial-mode resolution"
```

---

### Task 3: 일반 모드 시스템 프롬프트

**Files:**
- Create: `src/core/prompt/generalChat.ts`
- Create: `tests/unit/core/prompt/generalChat.test.ts`
- Modify: `src/core/prompt/mainAgent.ts` (2개 함수 `export`)

**Interfaces:**
- Consumes: `mainAgent.ts`의 `getUserMessageContext()`, `getCustomInstructions(customPrompt?: string)`
- Produces: `buildGeneralChatSystemPrompt(settings?: GeneralChatPromptSettings): string`, `interface GeneralChatPromptSettings { customPrompt?: string; userName?: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/core/prompt/generalChat.test.ts`:

```ts
import { buildGeneralChatSystemPrompt } from '@/core/prompt/generalChat';

describe('buildGeneralChatSystemPrompt', () => {
  it('states that the conversation has no Vault access', () => {
    const prompt = buildGeneralChatSystemPrompt();
    expect(prompt).toContain('General mode');
    expect(prompt).toContain('no tools');
  });

  it('addresses the user by name when configured', () => {
    expect(buildGeneralChatSystemPrompt({ userName: 'joo' })).toContain('**joo**');
  });

  it('falls back to a generic addressee when the name is blank', () => {
    expect(buildGeneralChatSystemPrompt({ userName: '   ' })).toContain('the user');
  });

  it('keeps the shared user-message context section', () => {
    expect(buildGeneralChatSystemPrompt()).toContain('## User Message Context');
  });

  it('appends custom instructions when present', () => {
    const prompt = buildGeneralChatSystemPrompt({ customPrompt: 'Answer in Korean.' });
    expect(prompt).toContain('## Custom Instructions');
    expect(prompt).toContain('Answer in Korean.');
  });

  it('omits the custom instructions heading when blank', () => {
    expect(buildGeneralChatSystemPrompt({ customPrompt: '  ' }))
      .not.toContain('## Custom Instructions');
  });

  // 이 단정들이 이 태스크의 존재 이유다. 일반 모드 프롬프트에 볼트 지침이
  // 새어 들어가면 모델이 있지도 않은 도구를 쓰려 든다.
  it('excludes every Vault-only section', () => {
    const prompt = buildGeneralChatSystemPrompt({ userName: 'joo' });
    expect(prompt).not.toContain('## Path Conventions');
    expect(prompt).not.toContain('## File Operations');
    expect(prompt).not.toContain('## Reference Conventions');
    expect(prompt).not.toContain('Vault absolute path');
    expect(prompt).not.toContain('bash: date');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/core/prompt/generalChat.test.ts
```

기대: FAIL — `Cannot find module '@/core/prompt/generalChat'`.

- [ ] **Step 3: `mainAgent.ts`의 두 함수를 export로 변경**

`src/core/prompt/mainAgent.ts`에서 아래 두 선언에 `export`를 붙인다. 본문은 건드리지 않는다.

31행:
```ts
function getUserMessageContext(): string {
```
→
```ts
export function getUserMessageContext(): string {
```

105행:
```ts
function getCustomInstructions(customPrompt: string | undefined): string {
```
→
```ts
export function getCustomInstructions(customPrompt: string | undefined): string {
```

- [ ] **Step 4: 구현**

`src/core/prompt/generalChat.ts`:

```ts
import { getCustomInstructions, getUserMessageContext } from './mainAgent';

export interface GeneralChatPromptSettings {
  customPrompt?: string;
  userName?: string;
}

function getGeneralChatRuntimeContext(userName: string | undefined): string {
  const trimmedUserName = userName?.trim();
  const addressee = trimmedUserName ? `**${trimmedUserName}**` : 'the user';

  return `## Runtime Context

You are Claudian, talking with ${addressee} inside Obsidian. This conversation runs in General mode: you have no tools and no access to the Vault's files.

- Answer from your own knowledge and from whatever context the user attached to the message.
- Never claim to have read, searched, or listed a Vault file, and never cite a Vault path that was not given to you.
- When the answer needs Vault content the user did not attach, say so and tell them to switch to Vault mode or attach the note with \`@\`.
- You cannot run shell commands. Never state the current date or time as fact unless the user provided it.`;
}

/**
 * System prompt for General mode.
 *
 * Deliberately omits the Vault sections of `buildSystemPrompt` (path
 * conventions, file operations, reference conventions, media folder, Vault
 * path). Attached context still reaches the model through the prompt encoder,
 * so the user-message context section is retained.
 */
export function buildGeneralChatSystemPrompt(
  settings: GeneralChatPromptSettings = {},
): string {
  return [
    getGeneralChatRuntimeContext(settings.userName),
    getUserMessageContext(),
    getCustomInstructions(settings.customPrompt),
  ].filter(Boolean).join('\n\n');
}
```

- [ ] **Step 5: 통과 확인**

```bash
npm run test:unit -- tests/unit/core/prompt/
npm run typecheck
```

기대: 새 테스트 PASS, 기존 프롬프트 테스트도 계속 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/core/prompt/generalChat.ts src/core/prompt/mainAgent.ts tests/unit/core/prompt/generalChat.test.ts
git commit -m "feat: add General mode system prompt without Vault sections"
```

---

### Task 4: 볼트 모드 동적 섹션

**Files:**
- Create: `src/core/prompt/vaultSearch.ts`
- Create: `tests/unit/core/prompt/vaultSearch.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `buildVaultSearchDynamicSection(): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/core/prompt/vaultSearch.test.ts`:

```ts
import { buildSystemPrompt } from '@/core/prompt/mainAgent';
import { buildVaultSearchDynamicSection } from '@/core/prompt/vaultSearch';

describe('buildVaultSearchDynamicSection', () => {
  it('tells the agent to search before answering', () => {
    const section = buildVaultSearchDynamicSection();
    expect(section).toContain('Grep');
    expect(section).toContain('Glob');
  });

  it('requires citing the notes it relied on', () => {
    expect(buildVaultSearchDynamicSection()).toContain('[[');
  });

  it('names the read-only boundary and the way out', () => {
    const section = buildVaultSearchDynamicSection();
    expect(section).toContain('read');
    expect(section).toContain('Agent mode');
  });

  it('survives being passed through buildSystemPrompt as a dynamic section', () => {
    const prompt = buildSystemPrompt(
      { vaultPath: '/vault', userName: 'joo' },
      { dynamicSections: [buildVaultSearchDynamicSection()] },
    );
    expect(prompt).toContain('## Vault Mode');
    expect(prompt).toContain('## Path Conventions');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/core/prompt/vaultSearch.test.ts
```

기대: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/core/prompt/vaultSearch.ts`:

```ts
/**
 * Dynamic system-prompt section for Vault mode.
 *
 * Appended to the standard Vault system prompt through
 * `ProviderSystemInstructions.dynamicSections`. Tool access is enforced
 * separately by the `read-only` tool policy; this section only shapes
 * behavior the policy cannot express.
 */
export function buildVaultSearchDynamicSection(): string {
  return `## Vault Mode

This conversation runs in Vault mode. You may read and search the Vault, and you cannot modify it.

- Search before answering. Use Grep and Glob to find the relevant notes instead of answering from memory or assumption.
- Cite the notes you relied on as \`[[vault-relative-path|display-name]]\`.
- When the Vault holds no answer, say plainly that you found nothing in it. Mark any part of the answer that comes from general knowledge rather than from a note.
- Write, Edit, and Bash are unavailable here. If the user asks you to change a file, tell them to switch to Agent mode.`;
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm run test:unit -- tests/unit/core/prompt/
```

기대: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/core/prompt/vaultSearch.ts tests/unit/core/prompt/vaultSearch.test.ts
git commit -m "feat: add Vault mode dynamic prompt section"
```

---

### Task 5: 설정 필드 추가

**Files:**
- Modify: `src/core/types/settings.ts` (`ClaudianSettings` 인터페이스)
- Modify: `src/app/settings/defaultSettings.ts:7` (`DEFAULT_CLAUDIAN_SETTINGS`)
- Test: `tests/unit/app/settings/defaultSettings.test.ts` (없으면 생성)

**Interfaces:**
- Consumes: Task 2의 `ChatMode`, `ChatModePreference`
- Produces: `ClaudianSettings.defaultChatMode: ChatModePreference`, `ClaudianSettings.lastUsedChatMode: ChatMode`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/app/settings/defaultSettings.test.ts` (이미 있으면 `describe` 블록만 추가):

```ts
import { DEFAULT_CLAUDIAN_SETTINGS } from '@/app/settings/defaultSettings';

describe('DEFAULT_CLAUDIAN_SETTINGS chat mode', () => {
  it('starts new tabs from the last used mode', () => {
    expect(DEFAULT_CLAUDIAN_SETTINGS.defaultChatMode).toBe('last-used');
  });

  it('remembers General as the initial mode', () => {
    expect(DEFAULT_CLAUDIAN_SETTINGS.lastUsedChatMode).toBe('general');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/app/settings/defaultSettings.test.ts
```

기대: FAIL — `defaultChatMode`가 `undefined`.

- [ ] **Step 3: 타입에 필드 추가**

`src/core/types/settings.ts`에서 `ClaudianSettings`의 `// Security` 블록 바로 아래(`permissionMode: PermissionMode;` 다음)에 추가:

```ts
  // Chat mode (host-owned; projected into provider tool policy at send time)
  /** Mode a freshly opened tab starts in. 'last-used' reuses lastUsedChatMode. */
  defaultChatMode: ChatModePreference;
  /** Most recent mode picked in any tab. Seeds new tabs when defaultChatMode is 'last-used'. */
  lastUsedChatMode: ChatMode;
```

같은 파일 상단 import에 추가:

```ts
import type { ChatMode, ChatModePreference } from './ChatMode';
```

- [ ] **Step 4: 기본값 추가**

`src/app/settings/defaultSettings.ts`에서 `permissionMode: 'yolo',` 바로 아래에 추가:

```ts
  defaultChatMode: 'last-used',
  lastUsedChatMode: 'general',
```

- [ ] **Step 5: 통과 확인**

```bash
npm run test:unit -- tests/unit/app/settings/
npm run typecheck
```

기대: PASS. 타입 오류가 나면 `ClaudianSettings` 객체를 리터럴로 만드는 다른 곳(테스트 픽스처 포함)에서 새 필수 필드를 빠뜨린 것이다. `npm run typecheck`이 지목하는 모든 위치에 두 필드를 추가한다.

- [ ] **Step 6: 커밋**

```bash
git add -A src/core/types/settings.ts src/app/settings/defaultSettings.ts tests/unit/app/settings/
git commit -m "feat: add defaultChatMode and lastUsedChatMode settings"
```

---

### Task 6: 탭별 모드 상태

모드는 탭마다 독립이어야 한다. 코드베이스가 이미 쓰는 `draftModel` 패턴(TabSession → shell → composeTabRuntime)을 그대로 따른다.

**Files:**
- Modify: `src/features/chat/tabs/TabSession.ts` (`TabSessionState` + 게터/세터)
- Modify: `src/features/chat/tabs/runtime/TabRuntimeShell.ts` (초기값 + 게터/세터)
- Modify: `src/features/chat/tabs/TabRuntimeFactory.ts:180` 부근 (`composeTabRuntime` 게터/세터)
- Modify: `src/features/chat/tabs/types.ts` (`AssembledTabRuntime`, `TabProviderContext`)
- Create: `src/features/chat/state/tabChatMode.ts`
- Create: `tests/unit/features/chat/state/tabChatMode.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 5
- Produces:
  - `AssembledTabRuntime.chatMode: ChatMode` (가변)
  - `getTabChatMode(tab: TabProviderContext): ChatMode`
  - `setTabChatMode(tab: AssembledTabRuntime, plugin: FeatureHost, mode: ChatMode): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/features/chat/state/tabChatMode.test.ts`:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
import { getTabChatMode, setTabChatMode } from '@/features/chat/state/tabChatMode';

function makeTab(chatMode: ChatMode) {
  return { chatMode } as { chatMode: ChatMode };
}

function makePlugin(lastUsedChatMode: ChatMode = 'general') {
  const settings = { defaultChatMode: 'last-used', lastUsedChatMode };
  return {
    settings,
    mutateSettings: jest.fn(async (mutate: (s: typeof settings) => void) => {
      mutate(settings);
    }),
  };
}

describe('getTabChatMode', () => {
  it('reads the tab field', () => {
    expect(getTabChatMode(makeTab('vault') as never)).toBe('vault');
  });

  it('falls back when the tab holds a bad value', () => {
    expect(getTabChatMode({ chatMode: 'nonsense' } as never)).toBe('general');
  });
});

describe('setTabChatMode', () => {
  it('writes the tab field', async () => {
    const tab = makeTab('general');
    const plugin = makePlugin();
    await setTabChatMode(tab as never, plugin as never, 'agent');
    expect(tab.chatMode).toBe('agent');
  });

  it('remembers the mode globally so new tabs inherit it', async () => {
    const plugin = makePlugin();
    await setTabChatMode(makeTab('general') as never, plugin as never, 'vault');
    expect(plugin.mutateSettings).toHaveBeenCalledTimes(1);
    expect(plugin.settings.lastUsedChatMode).toBe('vault');
  });

  it('does not persist when the mode did not change', async () => {
    const plugin = makePlugin('vault');
    await setTabChatMode(makeTab('vault') as never, plugin as never, 'vault');
    expect(plugin.mutateSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/features/chat/state/tabChatMode.test.ts
```

기대: FAIL — 모듈 없음.

- [ ] **Step 3: `TabSessionState`에 필드 추가**

`src/features/chat/tabs/TabSession.ts`:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
```

`TabSessionState`에 (알파벳 순서를 지킨다 — 이 파일은 정렬되어 있다):

```ts
export interface TabSessionState {
  chatMode: ChatMode;
  conversationId: string | null;
  draftModel: string | null;
  id: string;
  lifecycleState: TabLifecycleState;
  providerId: ProviderId;
}
```

`draftModel` 게터/세터 바로 아래에:

```ts
  get chatMode(): ChatMode { return this.state.chatMode; }
  set chatMode(value: ChatMode) { this.state.chatMode = value; }
```

- [ ] **Step 4: 탭 생성 시 초기값 설정**

`src/features/chat/tabs/runtime/TabRuntimeShell.ts`의 `sessionState` 리터럴에 추가:

```ts
  const sessionState = {
    id,
    lifecycleState: options.lifecycleState ?? 'cold',
    chatMode: resolveInitialChatMode(
      plugin.settings.defaultChatMode,
      plugin.settings.lastUsedChatMode,
    ),
    draftModel,
    providerId: initialProviderId,
    conversationId: conversation?.id ?? null,
  };
```

같은 파일 import에 추가:

```ts
import { resolveInitialChatMode } from '@/core/types/ChatMode';
```

그리고 반환 객체 리터럴의 `draftModel` 게터/세터 바로 아래에:

```ts
    get chatMode() {
      return session.chatMode;
    },
    set chatMode(value) {
      session.chatMode = value;
    },
```

- [ ] **Step 5: `composeTabRuntime`에 위임 추가**

`src/features/chat/tabs/TabRuntimeFactory.ts`의 `composeTabRuntime`에서 `draftModel` 게터/세터 바로 아래에:

```ts
    get chatMode() {
      return shell.chatMode;
    },
    set chatMode(value) {
      shell.chatMode = value;
    },
```

`TabRuntimeShellBundle` 타입(같은 파일 44행 부근에 `draftModel?: string | null;`이 있는 옵션 타입과는 다른 것)에 `chatMode`가 필요하다고 `tsc`가 지목하면 그곳에도 `chatMode: ChatMode;`를 추가한다.

- [ ] **Step 6: 타입 선언 추가**

`src/features/chat/tabs/types.ts`의 `AssembledTabRuntime`에서 `draftModel: string | null;` 블록 바로 아래:

```ts
  /** Host-owned chat mode for this tab. Projected into the provider tool policy on send. */
  chatMode: ChatMode;
```

같은 파일의 `TabProviderContext`와 `TabProviderCatalogContext`의 `Pick` 목록에 `'chatMode'`를 추가:

```ts
export type TabProviderContext = Pick<
  AssembledTabRuntime,
  'conversationId' | 'providerId' | 'lifecycleState' | 'draftModel' | 'chatMode'
>;
```

import 추가:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
```

- [ ] **Step 7: 헬퍼 모듈 구현**

`src/features/chat/state/tabChatMode.ts`:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
import { normalizeChatMode } from '@/core/types/ChatMode';
import type { FeatureHost } from '../../FeatureHost';
import type { AssembledTabRuntime, TabProviderContext } from '../tabs/types';

/** Reads the tab's mode, tolerating a corrupted value. */
export function getTabChatMode(tab: Pick<TabProviderContext, 'chatMode'>): ChatMode {
  return normalizeChatMode(tab.chatMode);
}

/**
 * Sets the tab's mode and remembers it globally so new tabs inherit it.
 *
 * The tab field is authoritative for this tab; `lastUsedChatMode` only seeds
 * tabs opened later. Skips the settings write when nothing changed.
 */
export async function setTabChatMode(
  tab: Pick<AssembledTabRuntime, 'chatMode'>,
  plugin: FeatureHost,
  mode: ChatMode,
): Promise<void> {
  const next = normalizeChatMode(mode);
  const previous = normalizeChatMode(tab.chatMode);
  tab.chatMode = next;
  if (previous === next && normalizeChatMode(plugin.settings.lastUsedChatMode) === next) {
    return;
  }
  await plugin.mutateSettings((settings) => {
    settings.lastUsedChatMode = next;
  });
}
```

- [ ] **Step 8: 통과 확인**

```bash
npm run test:unit -- tests/unit/features/chat/state/tabChatMode.test.ts
npm run typecheck
```

기대: PASS. `tsc`가 `chatMode` 누락을 지목하는 곳(테스트 픽스처, 목 탭 객체 등)이 있으면 모두 채운다.

- [ ] **Step 9: 커밋**

```bash
git add -A src/features/chat src/core/types tests/unit/features/chat/state
git commit -m "feat: track chat mode per tab, seeded from last used mode"
```

---

### Task 7: 모드 투사 모듈

모드를 프로바이더 계약으로 번역하는 유일한 지점. 여기에만 `switch`가 있어야 한다.

**Files:**
- Create: `src/features/chat/state/ChatModeProjection.ts`
- Create: `tests/unit/features/chat/state/ChatModeProjection.test.ts`

**Interfaces:**
- Consumes: Task 2 (`ChatMode`), Task 3 (`buildGeneralChatSystemPrompt`), Task 4 (`buildVaultSearchDynamicSection`), `ProviderToolPolicy`·`ProviderSystemInstructions` (`@/core/execution`)
- Produces:
  - `interface ChatModeProjectionInput { userName?: string; customPrompt?: string; dynamicSections?: readonly string[] }`
  - `interface ChatModeProjection { toolPolicy: ProviderToolPolicy; systemInstructions: ProviderSystemInstructions }`
  - `projectChatMode(mode: ChatMode, input?: ChatModeProjectionInput): ChatModeProjection`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/features/chat/state/ChatModeProjection.test.ts`:

```ts
import { projectChatMode } from '@/features/chat/state/ChatModeProjection';

describe('projectChatMode', () => {
  it('gives General mode no tools at all', () => {
    expect(projectChatMode('general').toolPolicy).toEqual({ kind: 'passive' });
  });

  it('gives Vault mode the read-only policy', () => {
    expect(projectChatMode('vault').toolPolicy).toEqual({ kind: 'read-only' });
  });

  it('leaves Agent mode on the provider default', () => {
    expect(projectChatMode('agent').toolPolicy).toEqual({ kind: 'provider-default' });
  });

  it('replaces the system prompt entirely in General mode', () => {
    const projection = projectChatMode('general', { userName: 'joo' });
    expect(projection.systemInstructions.kind).toBe('explicit');
    if (projection.systemInstructions.kind !== 'explicit') throw new Error('unreachable');
    expect(projection.systemInstructions.instructions).toContain('General mode');
    expect(projection.systemInstructions.instructions).not.toContain('## Path Conventions');
  });

  it('keeps instruction-mode sections in General mode', () => {
    const projection = projectChatMode('general', {
      dynamicSections: ['## Extra\n\nBe terse.'],
    });
    if (projection.systemInstructions.kind !== 'explicit') throw new Error('unreachable');
    expect(projection.systemInstructions.instructions).toContain('Be terse.');
  });

  it('adds the search directive on top of the Vault prompt', () => {
    const projection = projectChatMode('vault');
    expect(projection.systemInstructions.kind).toBe('provider-default');
    if (projection.systemInstructions.kind !== 'provider-default') throw new Error('unreachable');
    expect(projection.systemInstructions.dynamicSections?.[0]).toContain('## Vault Mode');
  });

  it('keeps instruction-mode sections after the Vault directive', () => {
    const projection = projectChatMode('vault', {
      dynamicSections: ['## Extra\n\nBe terse.'],
    });
    if (projection.systemInstructions.kind !== 'provider-default') throw new Error('unreachable');
    expect(projection.systemInstructions.dynamicSections).toHaveLength(2);
    expect(projection.systemInstructions.dynamicSections?.[1]).toContain('Be terse.');
  });

  it('leaves Agent mode instructions untouched when there are no sections', () => {
    expect(projectChatMode('agent').systemInstructions).toEqual({ kind: 'provider-default' });
  });

  it('passes instruction-mode sections straight through in Agent mode', () => {
    const projection = projectChatMode('agent', {
      dynamicSections: ['## Extra\n\nBe terse.'],
    });
    expect(projection.systemInstructions).toEqual({
      dynamicSections: ['## Extra\n\nBe terse.'],
      kind: 'provider-default',
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/features/chat/state/ChatModeProjection.test.ts
```

기대: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/features/chat/state/ChatModeProjection.ts`:

```ts
import type {
  ProviderSystemInstructions,
  ProviderToolPolicy,
} from '../../../core/execution';
import { buildGeneralChatSystemPrompt } from '../../../core/prompt/generalChat';
import { buildVaultSearchDynamicSection } from '../../../core/prompt/vaultSearch';
import type { ChatMode } from '@/core/types/ChatMode';

export interface ChatModeProjectionInput {
  /** Instruction-mode and other host-supplied prompt sections. */
  dynamicSections?: readonly string[];
  customPrompt?: string;
  userName?: string;
}

export interface ChatModeProjection {
  systemInstructions: ProviderSystemInstructions;
  toolPolicy: ProviderToolPolicy;
}

function toolPolicyFor(mode: ChatMode): ProviderToolPolicy {
  switch (mode) {
    case 'general':
      return { kind: 'passive' };
    case 'vault':
      return { kind: 'read-only' };
    case 'agent':
      return { kind: 'provider-default' };
  }
}

function providerDefaultInstructions(
  sections: readonly string[],
): ProviderSystemInstructions {
  return sections.length > 0
    ? { dynamicSections: [...sections], kind: 'provider-default' }
    : { kind: 'provider-default' };
}

function systemInstructionsFor(
  mode: ChatMode,
  input: ChatModeProjectionInput,
): ProviderSystemInstructions {
  const sections = input.dynamicSections ?? [];
  switch (mode) {
    case 'general':
      return {
        instructions: [
          buildGeneralChatSystemPrompt({
            ...(input.customPrompt !== undefined ? { customPrompt: input.customPrompt } : {}),
            ...(input.userName !== undefined ? { userName: input.userName } : {}),
          }),
          ...sections,
        ].filter(Boolean).join('\n\n'),
        kind: 'explicit',
      };
    case 'vault':
      return providerDefaultInstructions([buildVaultSearchDynamicSection(), ...sections]);
    case 'agent':
      return providerDefaultInstructions(sections);
  }
}

/**
 * Translates a host-owned chat mode into the provider-neutral execution
 * contract. This is the only place that knows what a mode means; provider
 * backends already implement every policy it returns.
 */
export function projectChatMode(
  mode: ChatMode,
  input: ChatModeProjectionInput = {},
): ChatModeProjection {
  return {
    systemInstructions: systemInstructionsFor(mode, input),
    toolPolicy: toolPolicyFor(mode),
  };
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm run test:unit -- tests/unit/features/chat/state/
npm run typecheck
```

기대: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/features/chat/state/ChatModeProjection.ts tests/unit/features/chat/state/ChatModeProjection.test.ts
git commit -m "feat: project chat mode into provider tool policy and system instructions"
```

---

### Task 8: 전송 경로에 투사 연결 (핵심)

이 태스크가 실제로 동작을 바꾼다. 앞의 태스크는 전부 이 두 줄을 위한 준비였다.

**Files:**
- Modify: `src/features/chat/controllers/InputController.ts` (deps 인터페이스 95행 부근, `createExecutionSubmission` 959행 부근, 사용자 메시지 생성 413행 부근)
- Modify: `src/features/chat/tabs/runtime/TabRuntimeControllers.ts:340` 부근
- Modify: `src/core/types/chat.ts:100` (`ChatMessage.chatMode?`)
- Test: `tests/unit/features/chat/controllers/InputController.test.ts` (기존 파일 확장)

**Interfaces:**
- Consumes: Task 6 (`getTabChatMode`), Task 7 (`projectChatMode`)
- Produces: `InputControllerDeps.getChatMode?: () => ChatMode`, `ChatMessage.chatMode?: ChatMode`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/features/chat/controllers/InputController.test.ts`에 아래 `describe`를 추가한다. 기존 파일의 헬퍼(목 deps 생성 함수)를 재사용하되, 이름이 다르면 파일 상단을 읽고 맞춘다. 기존 헬퍼가 없으면 이 블록이 쓰는 최소 목을 파일 내 지역 헬퍼로 만든다.

```ts
describe('InputController chat mode projection', () => {
  it('sends General mode with no tools and an explicit prompt', () => {
    const submission = buildSubmissionForMode('general');
    expect(submission.toolPolicy).toEqual({ kind: 'passive' });
    expect(submission.configuration.systemInstructions.kind).toBe('explicit');
  });

  it('sends Vault mode read-only with the search directive', () => {
    const submission = buildSubmissionForMode('vault');
    expect(submission.toolPolicy).toEqual({ kind: 'read-only' });
    expect(submission.configuration.systemInstructions).toMatchObject({
      kind: 'provider-default',
    });
  });

  it('sends Agent mode exactly as before', () => {
    const submission = buildSubmissionForMode('agent');
    expect(submission.toolPolicy).toEqual({ kind: 'provider-default' });
    expect(submission.configuration.systemInstructions).toEqual({
      kind: 'provider-default',
    });
  });

  it('defaults to General when the tab exposes no mode', () => {
    const submission = buildSubmissionForMode(undefined);
    expect(submission.toolPolicy).toEqual({ kind: 'passive' });
  });
});
```

`buildSubmissionForMode`는 같은 파일에 지역 헬퍼로 만든다. `createExecutionSubmission`은 private이므로 목 deps로 `InputController`를 만들고 `(controller as unknown as { createExecutionSubmission: (...args: unknown[]) => ChatTurnSubmission })`로 접근한다. 기존 테스트 파일이 이미 private 접근 패턴을 쓰고 있으면 그 방식을 따른다.

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/features/chat/controllers/InputController.test.ts
```

기대: FAIL — 일반/볼트 모드가 `{ kind: 'provider-default' }`를 반환한다 (아직 하드코딩).

- [ ] **Step 3: `ChatMessage`에 필드 추가**

`src/core/types/chat.ts`의 `ChatMessage`에서 `isInterrupt?: boolean;` 위에 추가:

```ts
  /**
   * Chat mode this turn was sent in. Live-session only: messages are rebuilt
   * from the provider transcript on reload, so this does not survive a restart.
   * Used to draw the mode-switch divider.
   */
  chatMode?: ChatMode;
```

import 추가:

```ts
import type { ChatMode } from './ChatMode';
```

- [ ] **Step 4: deps에 게터 추가**

`src/features/chat/controllers/InputController.ts`의 `InputControllerDeps`에서 `getTabProviderId?: () => ProviderId;` 바로 아래:

```ts
  /** Host-owned chat mode for this tab. Absent means General. */
  getChatMode?: () => ChatMode;
```

import 추가:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
import { FALLBACK_CHAT_MODE } from '@/core/types/ChatMode';
import { projectChatMode } from '../state/ChatModeProjection';
```

같은 파일에 private 헬퍼를 추가한다 (`createExecutionSubmission` 바로 위):

```ts
  private getChatMode(): ChatMode {
    return this.deps.getChatMode?.() ?? FALLBACK_CHAT_MODE;
  }
```

- [ ] **Step 5: 투사 적용**

`createExecutionSubmission` 안에서 `const existingUserTurns = ...` 다음 줄에 추가:

```ts
    const projection = projectChatMode(this.getChatMode(), {
      dynamicSections: dynamicSystemPromptSections,
      ...(typeof settings.systemPrompt === 'string'
        ? { customPrompt: settings.systemPrompt }
        : {}),
      ...(typeof settings.userName === 'string'
        ? { userName: settings.userName }
        : {}),
    });
```

같은 함수의 `return` 리터럴에서 아래 블록을 교체한다.

교체 전:
```ts
        systemInstructions: dynamicSystemPromptSections.length > 0
          ? {
              dynamicSections: [...dynamicSystemPromptSections],
              kind: 'provider-default',
            }
          : { kind: 'provider-default' },
```
교체 후:
```ts
        systemInstructions: projection.systemInstructions,
```

교체 전:
```ts
      toolPolicy: { kind: 'provider-default' },
```
교체 후:
```ts
      toolPolicy: projection.toolPolicy,
```

- [ ] **Step 6: 사용자 메시지에 모드 기록**

`src/features/chat/controllers/InputController.ts` 413행 부근의 `userMsg` 리터럴에 추가:

```ts
    const userMsg: ChatMessage = {
      id: this.deps.generateId(),
      role: 'user',
      content: displayContent,
      displayContent,                // Original user input (for UI display)
      timestamp: Date.now(),
      images: imagesForMessage,
      chatMode: this.getChatMode(),
    };
```

1397행 부근의 `userMessage` 리터럴에도 같은 줄(`chatMode: this.getChatMode(),`)을 추가한다.

- [ ] **Step 7: 탭에서 게터 배선**

`src/features/chat/tabs/runtime/TabRuntimeControllers.ts`의 `new InputController({ ... })` 안, `getTabProviderId:` 줄 바로 아래:

```ts
    getChatMode: () => getTabChatMode(runtimeRef.requirePublished()),
```

import 추가:

```ts
import { getTabChatMode } from '../../state/tabChatMode';
```

- [ ] **Step 8: 통과 확인**

```bash
npm run test:unit -- tests/unit/features/chat/
npm run typecheck
```

기대: 새 테스트 PASS, 기존 채팅 테스트 전부 PASS.

- [ ] **Step 9: 전체 테스트로 회귀 확인**

```bash
npm test
```

기대: 전부 PASS. 실패가 나면 그 테스트가 `toolPolicy: { kind: 'provider-default' }`를 단정하고 있을 것이다. 그 테스트가 에이전트 모드를 의도한다면 목 deps에 `getChatMode: () => 'agent'`를 주고, 의도가 불분명하면 기본값(일반)에 맞춰 단정을 고친다.

- [ ] **Step 10: 커밋**

```bash
git add -A src/features/chat src/core/types tests/unit/features/chat
git commit -m "feat: send each turn under the tab's chat mode"
```

---

### Task 9: i18n 문구 (10개 로케일)

UI보다 먼저 한다. `TranslationKey` 타입이 `en.json`에서 파생되므로(`src/i18n/types.ts`), `en.json`에 키가 없으면 UI 코드의 `t()` 호출이 타입 오류가 난다.

**Files:**
- Modify: `src/i18n/locales/en.json` (**먼저** — 타입의 원본)
- Modify: `src/i18n/locales/ko.json`, `ja.json`, `zh-CN.json`, `zh-TW.json`, `de.json`, `fr.json`, `es.json`, `pt.json`, `ru.json`

**Interfaces:**
- Consumes: 없음
- Produces: 아래 키들. `TranslationKey`에 자동 반영된다.
  - `chat.chatMode.label` / `.general` / `.vault` / `.agent`
  - `chat.chatMode.generalDesc` / `.vaultDesc` / `.agentDesc`
  - `chat.chatMode.switched` (파라미터 `{mode}`)
  - `settings.defaultChatMode.name` / `.desc` / `.lastUsed`

- [ ] **Step 1: `en.json`에 `chat.chatMode` 블록 추가**

`chat` 객체 안에 추가한다 (`chat.fork`, `chat.rewind`와 같은 레벨):

```json
    "chatMode": {
      "label": "Mode",
      "general": "General",
      "vault": "Vault",
      "agent": "Agent",
      "generalDesc": "Plain conversation. No tools, no Vault access.",
      "vaultDesc": "Reads and searches the Vault. Cannot modify files.",
      "agentDesc": "Full access. Reads, writes, and edits the Vault.",
      "switched": "Switched to {mode} mode"
    },
```

- [ ] **Step 2: `en.json`에 `settings.defaultChatMode` 블록 추가**

`settings` 객체 안에 추가한다:

```json
    "defaultChatMode": {
      "name": "Default chat mode",
      "desc": "Mode a newly opened chat tab starts in.",
      "lastUsed": "Last used"
    },
```

- [ ] **Step 3: 나머지 9개 로케일에 같은 구조로 추가**

각 파일의 `chat` / `settings` 객체 안에 같은 키를 넣는다. 값은 아래를 그대로 쓴다.

**ko.json**
```json
    "chatMode": {
      "label": "모드",
      "general": "일반",
      "vault": "볼트",
      "agent": "에이전트",
      "generalDesc": "도구 없이 일반 대화. 볼트에 접근하지 않습니다.",
      "vaultDesc": "볼트를 읽고 검색합니다. 파일을 수정하지 않습니다.",
      "agentDesc": "전체 권한. 볼트를 읽고 쓰고 수정합니다.",
      "switched": "{mode} 모드로 전환"
    },
```
```json
    "defaultChatMode": {
      "name": "기본 채팅 모드",
      "desc": "새로 연 채팅 탭이 시작할 모드입니다.",
      "lastUsed": "마지막 사용"
    },
```

**ja.json**
```json
    "chatMode": {
      "label": "モード",
      "general": "一般",
      "vault": "ボルト",
      "agent": "エージェント",
      "generalDesc": "ツールなしの通常会話。Vault にはアクセスしません。",
      "vaultDesc": "Vault を読み取り検索します。ファイルは変更しません。",
      "agentDesc": "全権限。Vault の読み取り・書き込み・編集を行います。",
      "switched": "{mode} モードに切り替えました"
    },
```
```json
    "defaultChatMode": {
      "name": "既定のチャットモード",
      "desc": "新しく開いたチャットタブが開始するモード。",
      "lastUsed": "前回使用"
    },
```

**zh-CN.json**
```json
    "chatMode": {
      "label": "模式",
      "general": "常规",
      "vault": "仓库",
      "agent": "智能体",
      "generalDesc": "纯对话，不使用工具，不访问仓库。",
      "vaultDesc": "读取并搜索仓库，不修改文件。",
      "agentDesc": "完全权限，可读取、写入和编辑仓库。",
      "switched": "已切换到{mode}模式"
    },
```
```json
    "defaultChatMode": {
      "name": "默认聊天模式",
      "desc": "新打开的聊天标签页的起始模式。",
      "lastUsed": "上次使用"
    },
```

**zh-TW.json**
```json
    "chatMode": {
      "label": "模式",
      "general": "一般",
      "vault": "保管庫",
      "agent": "代理程式",
      "generalDesc": "純對話，不使用工具，不存取保管庫。",
      "vaultDesc": "讀取並搜尋保管庫，不修改檔案。",
      "agentDesc": "完整權限，可讀取、寫入與編輯保管庫。",
      "switched": "已切換至{mode}模式"
    },
```
```json
    "defaultChatMode": {
      "name": "預設聊天模式",
      "desc": "新開啟的聊天標籤頁的起始模式。",
      "lastUsed": "上次使用"
    },
```

**de.json**
```json
    "chatMode": {
      "label": "Modus",
      "general": "Allgemein",
      "vault": "Vault",
      "agent": "Agent",
      "generalDesc": "Reines Gespräch. Keine Werkzeuge, kein Vault-Zugriff.",
      "vaultDesc": "Liest und durchsucht den Vault. Ändert keine Dateien.",
      "agentDesc": "Volle Rechte. Liest, schreibt und bearbeitet den Vault.",
      "switched": "In den Modus {mode} gewechselt"
    },
```
```json
    "defaultChatMode": {
      "name": "Standard-Chatmodus",
      "desc": "Modus, in dem ein neu geöffneter Chat-Tab startet.",
      "lastUsed": "Zuletzt verwendet"
    },
```

**fr.json**
```json
    "chatMode": {
      "label": "Mode",
      "general": "Général",
      "vault": "Coffre",
      "agent": "Agent",
      "generalDesc": "Conversation simple. Aucun outil, aucun accès au coffre.",
      "vaultDesc": "Lit et recherche dans le coffre. Ne modifie aucun fichier.",
      "agentDesc": "Accès complet. Lit, écrit et modifie le coffre.",
      "switched": "Passé en mode {mode}"
    },
```
```json
    "defaultChatMode": {
      "name": "Mode de discussion par défaut",
      "desc": "Mode dans lequel démarre un nouvel onglet de discussion.",
      "lastUsed": "Dernier utilisé"
    },
```

**es.json**
```json
    "chatMode": {
      "label": "Modo",
      "general": "General",
      "vault": "Bóveda",
      "agent": "Agente",
      "generalDesc": "Conversación simple. Sin herramientas ni acceso a la bóveda.",
      "vaultDesc": "Lee y busca en la bóveda. No modifica archivos.",
      "agentDesc": "Acceso completo. Lee, escribe y edita la bóveda.",
      "switched": "Cambiado al modo {mode}"
    },
```
```json
    "defaultChatMode": {
      "name": "Modo de chat predeterminado",
      "desc": "Modo con el que inicia una pestaña de chat nueva.",
      "lastUsed": "Último usado"
    },
```

**pt.json**
```json
    "chatMode": {
      "label": "Modo",
      "general": "Geral",
      "vault": "Cofre",
      "agent": "Agente",
      "generalDesc": "Conversa simples. Sem ferramentas nem acesso ao cofre.",
      "vaultDesc": "Lê e pesquisa o cofre. Não modifica arquivos.",
      "agentDesc": "Acesso total. Lê, escreve e edita o cofre.",
      "switched": "Alternado para o modo {mode}"
    },
```
```json
    "defaultChatMode": {
      "name": "Modo de conversa padrão",
      "desc": "Modo em que uma nova aba de conversa começa.",
      "lastUsed": "Último usado"
    },
```

**ru.json**
```json
    "chatMode": {
      "label": "Режим",
      "general": "Общий",
      "vault": "Хранилище",
      "agent": "Агент",
      "generalDesc": "Обычный разговор. Без инструментов и доступа к хранилищу.",
      "vaultDesc": "Читает и ищет в хранилище. Не изменяет файлы.",
      "agentDesc": "Полный доступ. Читает, записывает и редактирует хранилище.",
      "switched": "Переключено в режим «{mode}»"
    },
```
```json
    "defaultChatMode": {
      "name": "Режим чата по умолчанию",
      "desc": "Режим, в котором открывается новая вкладка чата.",
      "lastUsed": "Последний использованный"
    },
```

- [ ] **Step 4: 10개 파일 모두 유효한 JSON인지 확인**

```bash
for f in src/i18n/locales/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || echo "BROKEN: $f"; done
```

기대: 출력 없음.

- [ ] **Step 5: 키 누락 확인**

```bash
node -e "
const fs=require('fs');
const keys=['chat.chatMode.label','chat.chatMode.general','chat.chatMode.vault','chat.chatMode.agent','chat.chatMode.generalDesc','chat.chatMode.vaultDesc','chat.chatMode.agentDesc','chat.chatMode.switched','settings.defaultChatMode.name','settings.defaultChatMode.desc','settings.defaultChatMode.lastUsed'];
for (const f of fs.readdirSync('src/i18n/locales')) {
  const d=JSON.parse(fs.readFileSync('src/i18n/locales/'+f,'utf8'));
  for (const k of keys) {
    if (k.split('.').reduce((o,p)=>o&&o[p], d)===undefined) console.log('MISSING', f, k);
  }
}
console.log('done');
"
```

기대: `done`만 출력.

- [ ] **Step 6: 커밋**

```bash
git add src/i18n/locales
git commit -m "feat: add chat mode strings for all ten locales"
```

---

### Task 10: `ChatModeSelector` UI

**Files:**
- Create: `src/features/chat/ui/ChatModeSelector.ts`
- Create: `src/style/toolbar/chat-mode-selector.css`
- Create: `tests/unit/features/chat/ui/ChatModeSelector.test.ts`
- Modify: `src/style/index.css` (28행 부근 `@import` 목록)
- Modify: `src/style/accessibility.css` (포커스 링 목록)

**Interfaces:**
- Consumes: Task 2 (`CHAT_MODES`, `ChatMode`), Task 9 (i18n 키)
- Produces:
  - `interface ChatModeSelectorCallbacks { getChatMode: () => ChatMode; onChatModeChange: (mode: ChatMode) => Promise<void> }`
  - `class ChatModeSelector { constructor(parentEl: HTMLElement, callbacks: ChatModeSelectorCallbacks); updateDisplay(): void }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/features/chat/ui/ChatModeSelector.test.ts`:

```ts
import { createMockEl } from '@test/helpers/MockElement';

import type { ChatMode } from '@/core/types/ChatMode';
import { ChatModeSelector } from '@/features/chat/ui/ChatModeSelector';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  setIcon: jest.fn(),
}));

function setup(initialMode: ChatMode = 'general') {
  const parentEl = createMockEl();
  let mode = initialMode;
  const onChatModeChange = jest.fn(async (next: ChatMode) => {
    mode = next;
  });
  const selector = new ChatModeSelector(parentEl as never, {
    getChatMode: () => mode,
    onChatModeChange,
  });
  const container = parentEl.children[0];
  return { container, onChatModeChange, selector, getMode: () => mode };
}

describe('ChatModeSelector', () => {
  it('renders one segment per mode in display order', () => {
    const { container } = setup();
    expect(container.children).toHaveLength(3);
    expect(container.children.map(c => c.dataset.chatMode))
      .toEqual(['general', 'vault', 'agent']);
  });

  it('marks the current mode active', () => {
    const { container } = setup('vault');
    expect(container.children[0].hasClass('active')).toBe(false);
    expect(container.children[1].hasClass('active')).toBe(true);
    expect(container.children[2].hasClass('active')).toBe(false);
  });

  it('reports the clicked mode', async () => {
    const { container, onChatModeChange } = setup('general');
    container.children[2].click();
    await Promise.resolve();
    expect(onChatModeChange).toHaveBeenCalledWith('agent');
  });

  it('does not fire when the active segment is clicked again', async () => {
    const { container, onChatModeChange } = setup('general');
    container.children[0].click();
    await Promise.resolve();
    expect(onChatModeChange).not.toHaveBeenCalled();
  });

  it('moves the active class after an external mode change', () => {
    const { container, selector, getMode } = setup('general');
    container.children[1].click();
    void getMode();
    selector.updateDisplay();
    expect(container.children[1].hasClass('active')).toBe(true);
  });

  it('exposes the group and segments to assistive tech', () => {
    const { container } = setup();
    expect(container.getAttribute('role')).toBe('radiogroup');
    expect(container.children[0].getAttribute('role')).toBe('radio');
    expect(container.children[1].getAttribute('aria-checked')).toBe('false');
  });
});
```

`createMockEl`이 `click()`이나 `dataset`을 제공하지 않으면 `tests/helpers/MockElement.ts`를 읽고 그 헬퍼가 실제로 제공하는 방식(예: `addEventListener`로 등록된 핸들러를 직접 호출)으로 위 단정을 맞춘다. 헬퍼를 고치지 말고 테스트를 헬퍼에 맞춘다.

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/features/chat/ui/ChatModeSelector.test.ts
```

기대: FAIL — 모듈 없음.

- [ ] **Step 3: 컴포넌트 구현**

`src/features/chat/ui/ChatModeSelector.ts`:

```ts
import { Notice } from 'obsidian';

import type { ChatMode } from '@/core/types/ChatMode';
import { CHAT_MODES } from '@/core/types/ChatMode';
import { t } from '../../../i18n/i18n';

export interface ChatModeSelectorCallbacks {
  getChatMode: () => ChatMode;
  onChatModeChange: (mode: ChatMode) => Promise<void>;
}

/**
 * Three-way segmented control for the host-owned chat mode.
 *
 * Host-owned on purpose: the mode is projected into a provider-neutral tool
 * policy, so it must not live in the provider-supplied `ModeSelector` slot
 * (which is also two-option only).
 */
export class ChatModeSelector {
  private readonly container: HTMLElement;
  private readonly segmentEls = new Map<ChatMode, HTMLElement>();

  constructor(
    parentEl: HTMLElement,
    private readonly callbacks: ChatModeSelectorCallbacks,
  ) {
    this.container = parentEl.createDiv({ cls: 'claudian-chat-mode-selector' });
    this.render();
  }

  private render(): void {
    this.container.empty();
    this.segmentEls.clear();
    this.container.setAttribute('role', 'radiogroup');
    this.container.setAttribute('aria-label', t('chat.chatMode.label'));

    for (const mode of CHAT_MODES) {
      const segmentEl = this.container.createDiv({
        cls: 'claudian-chat-mode-segment',
        text: t(`chat.chatMode.${mode}`),
      });
      segmentEl.dataset.chatMode = mode;
      segmentEl.setAttribute('role', 'radio');
      segmentEl.setAttribute('tabindex', '0');
      segmentEl.setAttribute('title', t(`chat.chatMode.${mode}Desc`));
      segmentEl.addEventListener('click', () => {
        this.select(mode);
      });
      segmentEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.select(mode);
      });
      this.segmentEls.set(mode, segmentEl);
    }

    this.updateDisplay();
  }

  updateDisplay(): void {
    const current = this.callbacks.getChatMode();
    for (const [mode, segmentEl] of this.segmentEls) {
      const isActive = mode === current;
      segmentEl.toggleClass('active', isActive);
      segmentEl.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
  }

  private select(mode: ChatMode): void {
    if (mode === this.callbacks.getChatMode()) return;
    void this.callbacks.onChatModeChange(mode)
      .then(() => {
        this.updateDisplay();
      })
      .catch(() => {
        new Notice(t('chat.chatMode.label'));
        this.updateDisplay();
      });
  }
}
```

- [ ] **Step 4: 스타일 작성**

`src/style/toolbar/chat-mode-selector.css`:

```css
.claudian-chat-mode-selector {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 8px;
  background: var(--background-modifier-border);
}

.claudian-chat-mode-segment {
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.claudian-chat-mode-segment:hover {
  color: var(--text-normal);
}

.claudian-chat-mode-segment.active {
  background: var(--background-primary);
  color: var(--text-normal);
  font-weight: var(--font-medium);
}
```

- [ ] **Step 5: 스타일 등록**

`src/style/index.css`의 `@import "./toolbar/mode-selector.css";` 바로 아래에 추가:

```css
@import "./toolbar/chat-mode-selector.css";
```

`src/style/accessibility.css`의 포커스 링 셀렉터 목록(18행 부근)에 추가:

```css
.claudian-chat-mode-segment:focus-visible,
```

- [ ] **Step 6: 통과 확인**

```bash
npm run test:unit -- tests/unit/features/chat/ui/ChatModeSelector.test.ts
npm run typecheck
npm run lint:css
npm run build:css
```

기대: 테스트 PASS, 타입·CSS 린트 통과, CSS 빌드 성공. `t()` 호출에서 타입 오류가 나면 Task 9의 `en.json` 키가 빠진 것이다.

- [ ] **Step 7: 커밋**

```bash
git add src/features/chat/ui/ChatModeSelector.ts src/style tests/unit/features/chat/ui/ChatModeSelector.test.ts
git commit -m "feat: add three-way chat mode selector to the composer toolbar"
```

---

### Task 11: 툴바와 탭에 셀렉터 배선

여기까지 오면 셀렉터가 화면에 보이고 실제로 모드를 바꾼다.

**Files:**
- Modify: `src/features/chat/ui/InputToolbar.ts` (`ToolbarCallbacks` 36행 부근, `createInputToolbar` 723행 부근)
- Modify: `src/features/chat/tabs/types.ts` (`TabUIComponents` 119행 부근)
- Modify: `src/features/chat/tabs/runtime/TabRuntimeUI.ts` (콜백 376행 부근, 컴포넌트 배선 440행 부근, 리프레시 268·349행 부근)
- Modify: `tests/unit/features/chat/ui/InputToolbar.test.ts`

**Interfaces:**
- Consumes: Task 6 (`getTabChatMode`, `setTabChatMode`), Task 10 (`ChatModeSelector`)
- Produces: `ToolbarCallbacks.getChatMode`, `ToolbarCallbacks.onChatModeChange`, `createInputToolbar(...).chatModeSelector`, `TabUIComponents.chatModeSelector`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/features/chat/ui/InputToolbar.test.ts`의 `createInputToolbar` 관련 `describe`에 추가한다. 목 콜백 객체를 만드는 기존 헬퍼에 `getChatMode: () => 'general'`과 `onChatModeChange: jest.fn()`을 더한다.

```ts
  it('creates the chat mode selector', () => {
    const parentEl = createMockEl();
    const toolbar = createInputToolbar(parentEl as never, makeCallbacks());
    expect(toolbar.chatModeSelector).toBeDefined();
  });

  it('mounts the chat mode selector into the toolbar', () => {
    const parentEl = createMockEl();
    createInputToolbar(parentEl as never, makeCallbacks());
    const classes = parentEl.children.map(child => child.className);
    expect(classes).toContain('claudian-chat-mode-selector');
  });
```

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/features/chat/ui/InputToolbar.test.ts
```

기대: FAIL — `toolbar.chatModeSelector`가 `undefined`.

- [ ] **Step 3: `ToolbarCallbacks` 확장**

`src/features/chat/ui/InputToolbar.ts`의 `ToolbarCallbacks`에 추가:

```ts
  getChatMode: () => ChatMode;
  onChatModeChange: (mode: ChatMode) => Promise<void>;
```

import 추가:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
import { ChatModeSelector } from './ChatModeSelector';
```

- [ ] **Step 4: `createInputToolbar`에서 생성**

반환 타입과 본문에 추가한다. 셀렉터는 모델 선택기보다 **앞**(왼쪽)에 놓아 스크린샷의 `채팅 | Cowork` 위치와 맞춘다.

```ts
export function createInputToolbar(
  parentEl: HTMLElement,
  callbacks: ToolbarCallbacks
): {
  chatModeSelector: ChatModeSelector;
  modelSelector: ModelSelector;
  modeSelector: ModeSelector;
  thinkingBudgetSelector: ThinkingBudgetSelector;
  contextUsageMeter: ContextUsageMeter;
  layoutController: InputToolbarLayoutController;
  permissionToggle: PermissionToggle;
  serviceTierToggle: ServiceTierToggle;
} {
  const chatModeSelector = new ChatModeSelector(parentEl, {
    getChatMode: () => callbacks.getChatMode(),
    onChatModeChange: mode => callbacks.onChatModeChange(mode),
  });
  const modelSelector = new ModelSelector(parentEl, callbacks);
```

반환 리터럴에 `chatModeSelector,`를 추가한다.

- [ ] **Step 5: `TabUIComponents`에 추가**

`src/features/chat/tabs/types.ts`의 `TabUIComponents`에서 `readonly modeSelector: ModeSelector;` 바로 위에:

```ts
  readonly chatModeSelector: ChatModeSelector;
```

같은 파일 상단 import 블록(29행 부근, `ModeSelector`를 가져오는 곳)에 `ChatModeSelector`를 추가한다. `ChatModeSelector`는 `InputToolbar.ts`가 아니라 자기 모듈에서 가져온다:

```ts
import type { ChatModeSelector } from '../ui/ChatModeSelector';
```

- [ ] **Step 6: 툴바 콜백 배선**

`src/features/chat/tabs/runtime/TabRuntimeUI.ts`의 `onPermissionModeChange` 블록 바로 아래(같은 객체 안)에 추가:

```ts
    getChatMode: () => getTabChatMode(runtimeRef.requirePublished()),
    onChatModeChange: async (mode) => {
      const tab = runtimeRef.requirePublished();
      await setTabChatMode(tab, plugin, mode);
      tab.ui.chatModeSelector.updateDisplay();
      onUserModified();
    },
```

import 추가:

```ts
import { getTabChatMode, setTabChatMode } from '../../state/tabChatMode';
```

- [ ] **Step 7: UI 컴포넌트 번들에 추가**

같은 파일의 `const ui: TabUIComponents = { ... }` 리터럴에서 `modeSelector: toolbar.modeSelector,` 바로 위에:

```ts
    chatModeSelector: toolbar.chatModeSelector,
```

- [ ] **Step 8: 리프레시 지점에 추가**

`tab.ui.modeSelector.updateDisplay();`가 호출되는 모든 곳에 `tab.ui.chatModeSelector.updateDisplay();`를 함께 넣는다. 아래 명령으로 위치를 전부 찾는다.

```bash
grep -rn "modeSelector.updateDisplay()" src/features/chat
```

기대 위치: `TabRuntimeUI.ts` 2곳, `ClaudianView.ts` 1곳, `TabProviderState.ts` 1곳. 각 지점의 `tab`/`shell` 변수명에 맞춰 한 줄씩 추가한다.

- [ ] **Step 9: 통과 확인**

```bash
npm run test:unit -- tests/unit/features/chat/
npm run typecheck
```

기대: PASS. `tsc`가 `TabUIComponents` 리터럴에서 `chatModeSelector` 누락을 지목하는 테스트 픽스처가 있으면 목 객체(`{ updateDisplay: jest.fn() }`)를 넣는다.

- [ ] **Step 10: 전체 테스트**

```bash
npm test
```

- [ ] **Step 11: 커밋**

```bash
git add -A src/features/chat tests/unit/features/chat
git commit -m "feat: wire the chat mode selector into the toolbar and tab runtime"
```

---

### Task 12: 모드 전환 구분선

같은 대화 안에서 모드가 바뀐 지점을 메시지 흐름에 표시한다. **현재 세션에서만 보인다** — 메시지는 재시작 시 프로바이더 트랜스크립트에서 재구성되므로 `chatMode` 필드가 살아남지 않는다 (스펙 부록 A.2).

**Files:**
- Modify: `src/features/chat/rendering/MessageRenderer.ts` (필드 선언, `addMessage` 186행, `renderMessages` 290행 부근)
- Create: `src/style/features/chat-mode-divider.css`
- Modify: `src/style/index.css`
- Test: `tests/unit/features/chat/rendering/MessageRenderer.test.ts` (없으면 생성)

**Interfaces:**
- Consumes: Task 8 (`ChatMessage.chatMode`), Task 9 (`chat.chatMode.switched`)
- Produces: 없음 (렌더링 부수효과)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/features/chat/rendering/MessageRenderer.test.ts`에 추가한다. 기존 파일이 있으면 그 목 구성 방식을 따르고, 없으면 `createMockEl`로 최소 렌더러를 만든다.

```ts
describe('MessageRenderer chat mode divider', () => {
  it('draws no divider for the first user message', () => {
    const { renderer, messagesEl } = setupRenderer();
    renderer.addMessage(makeUserMessage({ chatMode: 'general' }));
    expect(dividerTexts(messagesEl)).toEqual([]);
  });

  it('draws no divider while the mode stays the same', () => {
    const { renderer, messagesEl } = setupRenderer();
    renderer.addMessage(makeUserMessage({ chatMode: 'general' }));
    renderer.addMessage(makeUserMessage({ chatMode: 'general' }));
    expect(dividerTexts(messagesEl)).toEqual([]);
  });

  it('draws a divider when the mode changes', () => {
    const { renderer, messagesEl } = setupRenderer();
    renderer.addMessage(makeUserMessage({ chatMode: 'general' }));
    renderer.addMessage(makeUserMessage({ chatMode: 'vault' }));
    expect(dividerTexts(messagesEl)).toHaveLength(1);
  });

  it('ignores assistant messages when deciding', () => {
    const { renderer, messagesEl } = setupRenderer();
    renderer.addMessage(makeUserMessage({ chatMode: 'vault' }));
    renderer.addMessage(makeAssistantMessage());
    renderer.addMessage(makeUserMessage({ chatMode: 'vault' }));
    expect(dividerTexts(messagesEl)).toEqual([]);
  });

  it('ignores messages with no recorded mode', () => {
    const { renderer, messagesEl } = setupRenderer();
    renderer.addMessage(makeUserMessage({ chatMode: 'vault' }));
    renderer.addMessage(makeUserMessage({}));
    expect(dividerTexts(messagesEl)).toEqual([]);
  });
});
```

`dividerTexts`는 `messagesEl.children`에서 `claudian-chat-mode-divider` 클래스를 가진 요소의 `textContent`를 모으는 지역 헬퍼로 만든다.

- [ ] **Step 2: 실패 확인**

```bash
npm run test:unit -- tests/unit/features/chat/rendering/MessageRenderer.test.ts
```

기대: 세 번째 테스트 FAIL (구분선이 0개).

- [ ] **Step 3: 렌더러에 상태 필드 추가**

`src/features/chat/rendering/MessageRenderer.ts`의 클래스 필드 선언부에 추가:

```ts
  private lastRenderedChatMode: ChatMode | null = null;
```

import 추가:

```ts
import type { ChatMode } from '@/core/types/ChatMode';
import { t } from '../../../i18n/i18n';
```

(`t`가 이미 import되어 있으면 중복 추가하지 않는다.)

- [ ] **Step 4: 구분선 렌더 로직 추가**

`addMessage(msg: ChatMessage)` 본문 **첫 줄**에 추가:

```ts
    this.renderChatModeDividerIfNeeded(msg);
```

같은 클래스에 private 메서드를 추가한다:

```ts
  /**
   * Marks the point where the user switched chat mode inside one conversation.
   *
   * Live-session only: `ChatMessage.chatMode` is not persisted, so a reopened
   * conversation shows no dividers.
   */
  private renderChatModeDividerIfNeeded(msg: ChatMessage): void {
    if (msg.role !== 'user') return;
    const mode = msg.chatMode;
    if (!mode) return;

    const previous = this.lastRenderedChatMode;
    this.lastRenderedChatMode = mode;
    if (previous === null || previous === mode) return;

    const dividerEl = this.messagesEl.createDiv({ cls: 'claudian-chat-mode-divider' });
    dividerEl.createSpan({
      cls: 'claudian-chat-mode-divider-label',
      text: t('chat.chatMode.switched', { mode: t(`chat.chatMode.${mode}`) }),
    });
  }
```

- [ ] **Step 5: 대화 전환 시 상태 초기화**

`renderMessages`의 `this.messagesEl.empty();` 바로 아래에 추가:

```ts
    this.lastRenderedChatMode = null;
```

- [ ] **Step 6: 스타일 작성**

`src/style/features/chat-mode-divider.css`:

```css
.claudian-chat-mode-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  color: var(--text-faint);
  font-size: var(--font-ui-smaller);
}

.claudian-chat-mode-divider::before,
.claudian-chat-mode-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--background-modifier-border);
}

.claudian-chat-mode-divider-label {
  white-space: nowrap;
}
```

`src/style/index.css`의 `features/` import 목록에 추가:

```css
@import "./features/chat-mode-divider.css";
```

- [ ] **Step 7: 통과 확인**

```bash
npm run test:unit -- tests/unit/features/chat/rendering/
npm run typecheck
npm run lint:css
```

- [ ] **Step 8: 커밋**

```bash
git add -A src/features/chat/rendering src/style tests/unit/features/chat/rendering
git commit -m "feat: mark mode switches in the message flow"
```

---

### Task 13: 기본 모드 설정 드롭다운

**Files:**
- Modify: `src/features/settings/ClaudianSettings.ts` (`renderGeneralTab`, 359행 부근 패턴 참고)

**Interfaces:**
- Consumes: Task 2 (`CHAT_MODES`, `ChatModePreference`), Task 5 (설정 필드), Task 9 (i18n)
- Produces: 없음

- [ ] **Step 1: 드롭다운 추가**

`renderGeneralTab`의 `settings.chatViewPlacement` 드롭다운 블록 바로 아래에 추가:

```ts
    new Setting(container)
      .setName(t('settings.defaultChatMode.name'))
      .setDesc(t('settings.defaultChatMode.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('last-used', t('settings.defaultChatMode.lastUsed'));
        for (const mode of CHAT_MODES) {
          dropdown.addOption(mode, t(`chat.chatMode.${mode}`));
        }
        dropdown
          .setValue(this.plugin.settings.defaultChatMode)
          .onChange(async (value) => {
            await this.plugin.mutateSettings((settings) => {
              settings.defaultChatMode = value as ChatModePreference;
            });
          });
      });
```

import 추가:

```ts
import type { ChatModePreference } from '@/core/types/ChatMode';
import { CHAT_MODES } from '@/core/types/ChatMode';
```

(경로는 파일 위치에 맞춰 `tsc`가 통과하는 값으로 조정한다.)

- [ ] **Step 2: 확인**

```bash
npm run typecheck
npm run lint:ts
```

- [ ] **Step 3: 커밋**

```bash
git add src/features/settings/ClaudianSettings.ts
git commit -m "feat: add default chat mode setting"
```

---

### Task 14: 인코더 계약 회귀 테스트

이 설계 전체가 "`passive`는 `tools: []`, `read-only`는 읽기 도구 + 거부 훅"이라는 업스트림 동작에 얹혀 있다. 리베이스로 그게 바뀌면 모드는 조용히 무력화된다. 그 계약을 테스트로 고정한다. **프로바이더 코드는 수정하지 않는다 — 읽기만 한다.**

**Files:**
- Modify: `tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts` (기존 하네스 재사용)

**Interfaces:**
- Consumes: Task 7 (`projectChatMode`가 내는 세 가지 `toolPolicy`)
- Produces: 없음 (회귀 방어)

- [ ] **Step 1: 기존 테스트 파일의 하네스 파악**

```bash
sed -n '1,140p' tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts
grep -n "getLastOptions\|createProviderRecoveryTestHarness\|toolPolicy" tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts
```

이 파일은 `@anthropic-ai/claude-agent-sdk` 목의 `getLastOptions()`로 SDK에 실제로 넘어간 옵션을 볼 수 있다. 기존 테스트가 한 턴을 실행하는 방식(하네스 생성 → 세션 시작 → 요청 전송)을 그대로 따른다.

- [ ] **Step 2: 실패하는 테스트 작성**

기존 파일 맨 아래에 `describe`를 추가한다. 한 턴을 실행하는 부분은 같은 파일의 기존 테스트에서 복사하고, `toolPolicy`만 바꾼다.

```ts
describe('tool policy contract that chat modes depend on', () => {
  it('sends no tools for the passive policy (General mode)', async () => {
    await runOneTurnWithToolPolicy({ kind: 'passive' });
    expect(sdkMock.getLastOptions()?.tools).toEqual([]);
  });

  it('sends only read-only tools for the read-only policy (Vault mode)', async () => {
    await runOneTurnWithToolPolicy({ kind: 'read-only' });
    const options = sdkMock.getLastOptions();
    expect(options?.tools).toEqual(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch']);
    expect(options?.hooks?.PreToolUse).toBeDefined();
  });

  it('leaves tools unconstrained for the provider default policy (Agent mode)', async () => {
    await runOneTurnWithToolPolicy({ kind: 'provider-default' });
    expect(sdkMock.getLastOptions()?.tools).toBeUndefined();
  });
});
```

`runOneTurnWithToolPolicy`는 같은 파일에 지역 헬퍼로 만든다. 기존 테스트가 요청 객체를 만드는 함수를 이미 갖고 있으면 그것을 재사용하고 `toolPolicy`만 인자로 받게 한다.

읽기 전용 도구 목록의 기대값은 하드코딩하지 말고 상수를 가져와도 된다:

```ts
import { READ_ONLY_TOOLS } from '@/core/tools/toolNames';
...
expect(options?.tools).toEqual([...READ_ONLY_TOOLS]);
```

상수를 쓰면 목록 변경에는 통과하고 **정책 배선이 끊기는 경우만** 잡는다. 둘 다 잡고 싶으면 리터럴 목록으로 둔다. 리터럴을 권한다 — 업스트림이 목록을 줄이면 볼트 모드의 검색 능력이 조용히 사라지므로 알아야 한다.

- [ ] **Step 3: 실패 확인**

헬퍼를 만들기 전 상태에서 한 번 돌려 컴파일 실패나 단정 실패를 확인한다.

```bash
npm run test:unit -- tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts
```

- [ ] **Step 4: 헬퍼 완성 후 통과 확인**

```bash
npm run test:unit -- tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts
```

기대: 세 테스트 PASS. **`read-only` 테스트가 실패하면 멈추고 보고한다** — 설계의 전제가 깨진 것이므로 계획을 다시 봐야 한다.

- [ ] **Step 5: 커밋**

```bash
git add tests/unit/providers/claude/execution/ClaudeExecutionBackend.test.ts
git commit -m "test: pin the tool policy contract that chat modes rely on"
```

---

### Task 15: 전체 검증과 볼트 배포

**Files:**
- 수정 없음 (검증만)

**Interfaces:**
- Consumes: Task 1-14 전부
- Produces: 볼트에 설치된 동작하는 플러그인

- [ ] **Step 1: 전체 게이트 통과**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

기대: 전부 통과. `npm test`에는 아키텍처 경계 검사와 **번들 크기 예산**(`scripts/check-startup-performance.mjs`의 `mainBudgetBytes`)이 포함된다. 크기 초과로 실패하면 코드를 줄이거나, 예산 상향이 정당한지 판단해 보고한다. 임의로 예산 숫자를 올리지 않는다.

- [ ] **Step 2: 산출물 확인**

```bash
ls -la main.js manifest.json styles.css
```

기대: 세 파일 존재.

- [ ] **Step 3: 배포 대상 볼트 확인**

사용자에게 어느 볼트에 설치할지 확인한다. 후보(현재 Claudian이 설치된 볼트는 없다):

```
/Users/smdjoo/Documents/01.Obsidian
/Users/smdjoo/Documents/01.Obsidian/JOO-LLM-WIKI_V2
/Users/smdjoo/Documents/01.Obsidian/joo_wiki_V3
/Users/smdjoo/Documents/01.Obsidian/AI_for_pastor
/Users/smdjoo/Desktop/BC_LLM_WiKI v3_claude
```

- [ ] **Step 4: 설치**

`VAULT`를 Step 3에서 정한 경로로 바꿔 실행한다.

```bash
VAULT="<사용자가 정한 볼트 경로>"
mkdir -p "$VAULT/.obsidian/plugins/claudian"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/claudian/"
ls -la "$VAULT/.obsidian/plugins/claudian/"
```

- [ ] **Step 5: 수동 검증 시나리오**

Obsidian에서 커뮤니티 플러그인 → Claudian 활성화 후, 아래를 순서대로 확인하고 각 항목의 실제 결과를 기록한다.

1. 채팅 사이드바를 열면 입력창 툴바에 `일반 | 볼트 | 에이전트`가 보인다.
2. **일반** 모드에서 "내 볼트에서 X를 찾아줘" → 볼트를 검색하지 않고, 볼트 모드 전환이나 `@` 첨부를 안내한다.
3. **일반** 모드에서 `@`로 노트를 붙이고 질문 → 붙인 노트 내용으로 답한다 (도구 없이).
4. **볼트** 모드에서 같은 질문 → Grep/Glob 도구 호출이 보이고 답에 위키링크 인용이 있다.
5. **볼트** 모드에서 "이 노트를 고쳐줘" → 거부하고 에이전트 모드 전환을 안내한다.
6. **에이전트** 모드에서 노트 수정 요청 → 기존처럼 수정된다 (회귀 없음).
7. 대화 중 일반 → 볼트 전환 → 앞선 맥락이 유지되고 메시지 흐름에 구분선이 보인다.
8. 탭을 2개 열어 서로 다른 모드로 두면 각 탭이 자기 모드를 유지한다.
9. 설정 → 일반 → "기본 채팅 모드"를 `볼트`로 고정하고 새 탭을 열면 볼트로 시작한다.
10. Obsidian 재시작 후 새 탭이 `lastUsedChatMode`(또는 고정값)로 열린다.

- [ ] **Step 6: 결과 보고**

10개 항목의 통과/실패를 표로 보고한다. 실패 항목은 재현 절차와 함께 남기고, 고칠지 여부를 사용자에게 확인한다.

- [ ] **Step 7: 푸시**

```bash
git push -u origin feat/chat-modes
```

---

### Task 16 (선택): 대화별 모드 영속화

Task 15까지로 기능은 완결된다. 이 태스크는 "옛 대화를 다시 열면 그 대화의 모드로 복원된다"만 추가한다. 스펙 부록 A.2 참조. **사용자가 명시적으로 요청할 때만 실행한다.**

**Files:**
- Modify: `src/core/types/chat.ts` (`Conversation`, `ConversationMeta`, `SessionMetadata`에 `chatMode?`)
- Modify: `src/core/bootstrap/SessionStorage.ts` (403·485-508행 부근 직렬화/역직렬화)
- Modify: `src/main.ts:1774` 부근 (메타데이터 → 대화 매핑)
- Modify: `src/app/conversations/ConversationRepository.ts` (400·418·618행 부근 생성/수정 경로)
- Modify: `src/features/chat/state/tabChatMode.ts` (바인딩된 탭이면 대화에 저장)
- Modify: `src/features/chat/tabs/runtime/TabRuntimeShell.ts` (바인딩된 탭이면 대화에서 복원)

**Interfaces:**
- Consumes: Task 6, Task 8
- Produces: `Conversation.chatMode?: ChatMode`

- [ ] **Step 1: 착수 전 재확인**

`selectedModel`이 위 6개 파일을 어떻게 통과하는지 먼저 읽는다.

```bash
grep -rn "selectedModel" src | grep -v "core/providers/conversationModel.ts"
```

`chatMode`는 정확히 같은 경로를 따라가야 한다. 다른 경로를 만들면 마이그레이션이 어긋난다.

- [ ] **Step 2: 하위 호환 규칙 확정**

`chatMode`가 없는 기존 대화는 `'agent'`로 간주한다 (지금까지의 동작이 에이전트였으므로). `'general'`로 두면 옛 대화가 갑자기 볼트를 못 읽게 되어 회귀로 체감된다. 이 규칙에 대한 테스트를 먼저 쓴다.

- [ ] **Step 3: 나머지는 Task 6·8과 동일한 TDD 절차**

각 파일마다 실패 테스트 → 구현 → 통과 → 커밋.

---

## 범위에서 제외한 것

- **일반 모드에서 도구가 필요한 슬래시 커맨드 차단.** 스펙 §8에 엣지 케이스로 적었지만, 코드를 확인한 결과 `InputController`는 슬래시 커맨드를 해석하지 않는다 — CLI가 직접 확장한다. 커맨드의 `allowedTools`를 전송 시점에 보려면 새 배선이 필요하고, 얻는 것은 프롬프트가 이미 처리하는 안내다(일반 모드 프롬프트가 "도구가 없으니 모드를 바꾸라"고 답하게 한다). 넣지 않는다.
- **Collab 모드 진입 시 모드 자동 승격.** Collab은 파일 쓰기가 본질이라 에이전트 모드를 요구하지만, 자동 승격은 사용자가 고른 모드를 덮는 동작이다. 필요해지면 별도로 다룬다.
- **모드별 모델·추론 강도 프리셋.** YAGNI.
- **웜 세션 풀의 모드 예열.** 모드가 다른 첫 전송에서 세션 재시작이 한 번 일어나지만 기존 `restartKey` 경로라 정상 동작한다. 최적화하지 않는다.
