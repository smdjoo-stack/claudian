[English](README.md) | **한국어**

# Jclaudian

볼트 안에 AI 코딩 에이전트(Claude Code, Codex, Grok, OpenCode, Pi)를 넣어 주는 Obsidian 플러그인입니다. 여기에 **채팅 모드 전환기**가 붙어 있어서, 에이전트가 볼트에 얼마나 접근할 수 있는지를 사용자가 정합니다.

Jclaudian은 Yishen Tu가 만든 [Claudian](https://github.com/YishenTu/claudian)의 포크입니다. 무엇을 바탕으로 만들어졌고 무엇이 달라졌는지는 [출처](#출처)에 정리해 두었습니다.

## 이 포크가 존재하는 이유

Claudian에서는 볼트가 곧 에이전트의 작업 디렉터리입니다. 그래서 모든 메시지가 볼트 파일을 읽고 쓸 수 있습니다. 그게 이 플러그인의 존재 이유이긴 하지만, 동시에 이런 게 불가능해집니다 — 그냥 모델과 **대화만** 하기, 또는 쓰기 권한까지 넘기지 않고 내 노트에 대해 **질문만** 하기.

Jclaudian은 입력창 툴바에 3단 모드 선택기를 추가합니다:

| 모드 | 에이전트가 쓸 수 있는 도구 | 쓰는 상황 |
|---|---|---|
| **일반** | 없음 | 순수 대화. 볼트 접근이 아예 없습니다. |
| **볼트** | `Read` `Grep` `Glob` `LS` `WebSearch` `WebFetch` | 내 노트에 대해 질문하기. 읽고 인용하지만 수정하지 못합니다. |
| **에이전트** | 전체 | Claudian의 원래 동작. 읽기·쓰기·수정·bash. |

모드는 **탭별**입니다. 한 탭에서는 일반 대화를, 다른 탭에서는 볼트 조사를 동시에 할 수 있습니다. 새 탭은 마지막에 쓴 모드로 시작하고, 설정에서 특정 모드로 고정할 수도 있습니다.

대화 중간에 모드를 바꿔도 되고, 앞선 대화 맥락은 유지됩니다. 메시지 흐름에 전환 지점이 표시됩니다.

### 모드가 실제로 어떻게 강제되는가

모드는 프롬프트로 부탁하는 장치가 아닙니다. Claudian이 이미 갖고 있던 프로바이더 중립 도구 정책에 모드를 투사하므로, **도구를 부여하는 지점에서** 강제됩니다:

- **일반** → `passive` 정책
- **볼트** → `read-only` 정책 + 읽기 목록 밖의 도구를 거부하는 `PreToolUse` 훅
- **에이전트** → `provider-default` 정책 (업스트림과 동일)

**강제 강도는 프로바이더마다 다릅니다. 일반 모드를 신뢰하기 전에 이걸 아셔야 합니다:**

| 프로바이더 | 일반 모드의 강제 방식 |
|---|---|
| Claude Code | 도구 제거 — SDK에 `tools: []`가 전달됩니다. 확실한 차단. |
| Pi | 도구 제거 — `noTools: true`. 확실한 차단. |
| OpenCode | passive 에이전트 프로필 + 파일시스템 델리게이트 자체를 넘기지 않음. 구조적 차단. |
| Codex | 도구를 호출하지 말라는 프롬프트 지시 + 읽기 전용 샌드박스. **도구는 등록된 상태로 남습니다.** 지시를 무시하는 모델은 파일을 읽을 수 있고, 쓰기는 샌드박스에서 막힙니다. |
| Grok | 도구를 호출하지 말라는 프롬프트 지시. 쓰기는 권한 게이트에서 취소되지만, CLI가 자동 승인하는 읽기는 그 게이트를 거치지 않습니다. |

정리하면, Claude·Pi·OpenCode에서 일반 모드는 **진짜 차단**입니다. Codex·Grok에서는 **강한 요청 + 샌드박스**입니다. 이건 해당 CLI의 성질이고 이 플러그인의 문제가 아닙니다 — 플러그인은 프로바이더 코드를 수정하지 않습니다.

일반 모드가 **일부러 막지 않는** 것이 하나 있습니다: 사용자가 직접 붙인 컨텍스트입니다. `@`로 첨부한 파일, 현재 에디터 선택 영역, 이미지는 여전히 모델에 전달되고, 일반 모드 시스템 프롬프트도 그렇게 명시합니다. "도구 없음"은 **에이전트가 스스로 볼트를 뒤지지 못한다**는 뜻이지, 내가 건네준 것까지 못 본다는 뜻이 아닙니다.

## 요구 사항

업스트림과 같습니다:

- 하네스 중 최소 하나:
  - [Claude Code CLI](https://code.claude.com/docs/en/overview)
  - [Codex CLI](https://github.com/openai/codex)
  - [Grok Build](https://github.com/xai-org/grok-build)
  - [OpenCode](https://github.com/anomalyco/opencode)
  - [Pi](https://github.com/earendil-works/pi)
- 사용하는 CLI에 맞는 구독 또는 API 제공자
- Obsidian v1.13.0 이상
- 데스크톱 전용 (macOS, Linux, Windows)
- Collab 모드는 [Git](https://git-scm.com/install/)이 필요합니다

## 설치

이 포크는 커뮤니티 플러그인 목록에 없으므로 소스에서 빌드합니다.

```bash
git clone https://github.com/smdjoo-stack/claudian.git jclaudian
cd jclaudian
npm install
npm run build
```

빌드 산출물 3개를 볼트에 복사합니다:

```bash
VAULT=/볼트/경로
mkdir -p "$VAULT/.obsidian/plugins/jclaudian"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/jclaudian/"
```

폴더 이름은 반드시 `jclaudian`이어야 합니다 — Obsidian이 `manifest.json`의 `id`와 대조하기 때문입니다. 그다음 설정 → 커뮤니티 플러그인에서 활성화하세요.

개발 중이라면 `.env.local`에 볼트 경로를 넣어 두면 감시 빌드가 변경마다 자동 복사합니다:

```
OBSIDIAN_VAULT=/볼트/경로
```

```bash
npm run dev
```

### CLI가 감지되지 않을 때

GUI로 실행한 Obsidian은 셸의 `PATH`를 물려받지 않습니다. 그래서 `~/.local/bin`이나 버전 관리자 아래에 설치된 CLI를 못 찾을 수 있습니다. 설정 → Jclaudian → Claude CLI 경로에 직접 지정하세요. macOS·Linux에서는 `which claude`의 출력을 붙여넣으면 됩니다.

## 이 포크가 추가한 설정

- **기본 채팅 모드** (설정 → 일반): 새로 연 탭이 시작할 모드 — 마지막에 쓴 모드, 또는 고정할 모드.

## 그 외 모든 기능

나머지 기능은 전부 업스트림 Claudian의 것입니다: 인라인 편집, 슬래시 커맨드와 스킬, 볼트 파일·폴더 `@mention`, instruction 모드, MCP 서버, 탭과 세션 관리.

**Collab 모드**(실험적)는 로컬 네트워크를 통해 다른 사용자와 프로젝트를 공유하며 협업하는 기능입니다. [자세히](https://claudian.md/docs/collab-mode/).

업스트림 전체 문서는 [claudian.md](https://claudian.md/) 또는 [업스트림 README](https://github.com/YishenTu/claudian#readme)를 보세요.

이 포크의 알려진 한계: 메시지 흐름의 모드 전환 구분선은 **현재 세션에서만** 보입니다. Claudian은 메시지 본문을 저장하지 않고 프로바이더의 트랜스크립트에서 재구성하므로, 예전 대화를 다시 열면 구분선이 없습니다. 모드 자체는 정상 동작합니다.

## 개인정보와 데이터 사용

업스트림과 동일하며, 포크가 조용히 빠뜨려서는 안 되는 종류의 정보라 여기에 다시 적습니다:

- **API로 전송되는 것**: 입력한 내용, 첨부한 파일, 이미지, 도구 호출 결과. 선택한 프로바이더에 따라 Anthropic(Claude), OpenAI(Codex), xAI(Grok), 또는 OpenCode·Pi에 설정된 제공자로 전송됩니다. 전송 대상은 프로바이더 설정과 환경 변수로 바꿀 수 있습니다.
- **Collab LAN 트래픽**: Collab 프로젝트를 직접 호스트하거나 동기화할 때, 프로젝트 Git 데이터와 인증된 조정 메타데이터가 **초대된 팀원의 기기 사이로 로컬 네트워크를 통해 직접** 이동합니다. Collab 모드 자체는 프로젝트 데이터를 Claudian 클라우드 서비스나 제3자에게 보내지 않습니다.
- **텔레메트리나 요청하지 않은 백그라운드 활동 없음**: Claudian은 텔레메트리 비콘을 실행하지 않습니다. UI 폴링 타이머는 로컬 Obsidian·에디터의 선택 상태만 읽습니다. 네트워크 활동은 명시적인 프로바이더 런타임 작업, 설정된 MCP 엔드포인트, 요청에 답하기 위한 프로바이더 SDK·CLI 호출, 그리고 명시적으로 시작한 Collab LAN 작업으로 한정됩니다.

채팅 모드는 위 내용을 바꾸지 않습니다. 일반 모드는 도구를 부여하지 않으므로, 일반 모드 턴은 메시지와 첨부한 컨텍스트를 전송하되 파일 읽기는 발생시키지 않습니다.

## 출처

| | |
|---|---|
| 업스트림 프로젝트 | [YishenTu/claudian](https://github.com/YishenTu/claudian) |
| 업스트림 저자 | Yishen Tu |
| 포크 지점 | 커밋 `6148cb2` — *"perf: defer collapsed stored tool output until expansion (#1304)"*, 2026-09-10 |
| 포크 당시 업스트림 버전 | 2.2.6 |
| 라이선스 | MIT (변경 없음, [LICENSE](LICENSE) 참조) |

### 이 포크가 바꾼 것

추가한 것 — 전부 `src/features/chat/**`, `src/core/types/`, `src/core/prompt/`, `src/i18n/` 안:

- 3개 모드를 가진 `ChatMode` 타입, 그리고 값이 손상되면 일반 모드로 떨어뜨리는 정규화
- `ChatModeProjection` — 모드를 도구 정책과 시스템 프롬프트 형태로 번역하는 **유일한** 지점
- 표준 프롬프트의 볼트 관련 섹션을 빼고 공용 섹션은 재사용하는 일반 모드 시스템 프롬프트
- `Grep`/`Glob`으로 검색하고 근거 노트를 인용하라고 지시하는 볼트 모드 프롬프트 섹션
- 탭별 모드 상태, 전역 "마지막 사용" 설정에서 초기값을 받음
- 입력창 툴바의 세그먼트 모드 선택기 (네이티브 버튼, `aria-pressed`, 키보드·스크린리더 접근 가능)
- 모드가 바뀐 지점을 표시하는 메시지 흐름 구분선
- "기본 채팅 모드" 설정
- 플러그인이 지원하는 10개 로케일 전체의 문자열

**일부러 바꾸지 않은 것:**

- `src/providers/**`와 `src/core/execution/**`는 한 줄도 손대지 않았습니다. 이 기능이 의존하는 도구 정책(`passive`, `read-only`, `provider-default`)은 이미 존재했고 모든 프로바이더 백엔드가 이미 구현하고 있었기 때문에, 프로바이더 코드를 바꿀 필요가 없었습니다. 그래서 **에이전트 모드는 Claudian이 원래 보내던 요청과 바이트 단위로 동일한 요청**을 만듭니다.
- 내부 식별자: CSS 클래스, 뷰 타입, `.claudian` 저장 폴더는 원래 이름을 유지합니다. 플러그인의 공개 정체성(`id`, `name`)만 바꿨기 때문에 기존 세션 데이터를 그대로 찾습니다.
- `package.json`의 npm 패키지 이름도 `claudian`으로 유지합니다. npm에 발행되지 않는 사설 필드이고, `bun.lock`과 `package-lock.json` 양쪽에 그 이름이 기록되어 있습니다. CI가 `--frozen-lockfile`로 검증하므로 바꾸면 빌드가 깨지고, 사용자에게 보이는 이득은 없습니다.

### 설계 문서

채팅 모드 기능의 설계 스펙과 구현 계획은 `docs/superpowers/`에 있습니다. 한국어로 쓰여 있고, 플러그인의 동작이 아니라 이 포크의 개발 과정을 기술합니다. 사용법만 알고 싶다면 위 섹션들을 보시면 됩니다.

## 라이선스

업스트림에서 이어받은 MIT입니다. 원저작권 표시는 [LICENSE](LICENSE)에 그대로 유지되어 있습니다. 이 포크를 재배포한다면 그 표시를 유지하세요.
