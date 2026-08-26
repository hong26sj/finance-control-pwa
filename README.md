# Flow — 개인 자금관리 PWA

가계부, 주간 사용 가능액, 카드 실적, 고정비·현금흐름, 대출 상환을 함께 관리하는 모바일 우선 PWA입니다.

## 현재 미리보기

- 현대·신한 2026년 7월 카드 내역 170건 반영(취소 9건 제외)
- 테스트 날짜를 7월 15일·28일 등으로 바꾸면 해당 날짜까지의 데이터만으로 전체 화면 재계산
- 직접 거래 입력, 수정, 완전 삭제
- 현대·신한 `.xlsx` 직접 업로드 및 겹치는 기간의 중복 자동 제외
- 승인번호 미수집, 카드 전체번호·비밀번호 미사용
- 모든 카드 거래는 실적 기본 포함, 사용자 제외 거래만 직접 체크 해제
- 현금서비스는 생활비 거래로 분류
- 주간 기본금액 130,000원과 이전 주 잔여/초과 이월
- 고정비 예정/실제액, 현금흐름, 대출 잔액·금리·정기/추가상환액 직접 수정

`public/private-preview-data.json`과 `public/private-preview-config.json`은 실제 거래·예산·대출·고정비가 들어간 로컬 미리보기 파일이며 `.gitignore`에 포함되어 있습니다. 공개 GitHub 저장소나 GitHub Pages 결과물에는 포함되지 않습니다.

## 실행

```bash
pnpm install
pnpm dev
```

정적 배포 파일은 `pnpm build` 후 `out/`에 만들어집니다. `main` 브랜치에 변경 사항이 올라오면 `.github/workflows/deploy-pages.yml`이 GitHub Pages를 자동 배포합니다. GitHub Pages에는 공개 가능한 PWA 코드만 두고, 실제 앱은 Google Apps Script를 통해 사용자의 Google Drive JSON 저장소와 통신합니다.

## 데이터 저장 구조

- GitHub Pages: 공개 가능한 PWA 화면 코드
- Google Apps Script: 토큰 검사와 데이터 읽기/저장 API
- Google Drive: 사용자 계정 안의 비공개 JSON 원본
- iPhone: 홈 화면에 설치해 앱처럼 사용

## Apps Script 설치

1. [Google Apps Script](https://script.google.com/)에서 새 프로젝트를 만듭니다.
2. `apps-script/`의 `Code.gs`, `Security.gs`, `Storage.gs`를 같은 이름으로 복사하고 `appsscript.json` 설정도 반영합니다.
3. 20자 이상의 임의 토큰을 정한 뒤 편집기에서 `setupFinanceStorage('', '여기에_토큰')`을 한 번 실행합니다. 특정 Drive 폴더를 쓰려면 첫 번째 인수에 폴더 ID를 넣습니다.
4. `배포` → `새 배포` → `웹 앱`을 선택하고, 실행 사용자는 **나**, 접근 권한은 **모든 사용자**로 배포합니다. 실제 데이터는 토큰 없이는 읽거나 저장할 수 없습니다.
5. 발급된 `/exec` 주소와 같은 토큰을 PWA의 `연결 설정`에 입력합니다.
6. 먼저 PC 미리보기에서 `현재 데이터를 Drive에 저장`을 눌러 로컬 데이터를 Drive로 옮긴 뒤, iPhone에서는 `Drive에서 불러오기`를 누릅니다.

토큰 원문, Apps Script `/exec` 주소, Drive 파일·폴더 ID, 실제 거래·예산·대출 정보는 GitHub에 커밋하지 않습니다. 토큰 변경이 필요하면 Apps Script 편집기에서 `resetFinanceAccessToken('새로운_20자_이상_토큰')`을 실행합니다.

## iPhone 설치

GitHub Pages 주소를 Safari로 연 뒤 공유 버튼 → `홈 화면에 추가`를 선택합니다. 첫 실행에서 `연결 설정`에 Apps Script 주소와 토큰을 등록하면 PC와 같은 Google Drive 데이터를 사용합니다.
