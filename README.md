# My Program

바이브 코딩으로 만든 웹게임·앱을 모아 보는 런처입니다.
배포 주소: https://atho3398.github.io/my-program/

## 게임 추가하기

`games.json`에 항목을 하나 더 넣고 `main`에 푸시하면 GitHub Actions가 자동으로 배포합니다.

```json
{
  "id": "my-game",
  "name": "게임 이름",
  "category": "게임",
  "url": "https://atho3398.github.io/my-game/",
  "icon": "https://atho3398.github.io/my-game/icons/icon-192.png",
  "description": "한 줄 설명",
  "tags": ["퍼즐", "캐주얼"],
  "orientation": "landscape"
}
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `name` | ✔ | 화면에 보이는 이름 |
| `url` | ✔ | 실행할 주소 |
| `category` | | `게임`, `도구`, `그 외` 중 하나. 비우거나 다른 값이면 `그 외`로 들어갑니다 |
| `icon` | | 이미지 주소 또는 이모지(`"🎮"`). 비우면 이름 첫 글자로 아이콘을 만듭니다 |
| `description` | | 카드에 보이는 설명 |
| `tags` | | 태그 필터 칩으로 쓰입니다 |
| `id` | | 기록·즐겨찾기 저장 키. 비우면 주소로 만듭니다 (나중에 주소가 바뀌어도 기록을 유지하려면 지정하세요) |
| `launch` | | `"tab"`이면 설정과 상관없이 항상 새 탭으로 엽니다. 다른 사이트 안에 띄우는 것을 막아 둔 앱(로그인 앱 등)에 씁니다 |
| `orientation` | | 전체화면 실행 시 화면 방향 고정 (`landscape`/`portrait`, 안드로이드에서만 동작) |

## 웹이 아닌 앱 넣기

`url`에 `https://` 말고 앱 링크를 넣으면, 누를 때 그 앱이 열립니다 (해당 기기에 앱이 설치돼 있어야 해요).

| 종류 | `url` 예시 |
| --- | --- |
| 맥에서 켜 둔 로컬 웹 도구 | `http://localhost:8765/` (+ `"launch": "tab"`) |
| iPhone/맥 단축어 | `shortcuts://run-shortcut?name=단축어이름` |
| 안드로이드 앱 | `intent://#Intent;package=com.example.app;end` |
| 자체 URL 스킴이 있는 앱 | `myapp://` |
| 설치 파일 배포 | GitHub Releases 다운로드 주소 |

## 기능

- 카드를 누르면 설정한 방식(전체화면 / 새 탭)으로 열기
- 분류 탭(전체 / 게임 / 도구 / 그 외). 카드의 ⋯ 메뉴에서 분류를 바꿀 수 있습니다 (그 기기에만 저장. 모든 기기에 반영하려면 `games.json`의 `category`를 바꾸세요)
- 최근 사용, 즐겨찾기, 사용 횟수 (브라우저 localStorage에 저장)
- 검색, 태그 필터, 정렬
- PWA: 홈 화면에 설치, 오프라인에서도 런처 화면이 열림

## 로컬에서 보기

```bash
python3 -m http.server 8000
```

http://localhost:8000 을 엽니다.

## 배포 설정

저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 두면 됩니다.
워크플로가 처음 실행될 때 자동으로 켜도록 되어 있지만, 실패하면 위 설정을 직접 바꾼 뒤 Actions 탭에서 다시 실행하세요.
