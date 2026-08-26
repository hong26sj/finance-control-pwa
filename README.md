# Flow — 개인 자금관리 PWA

가계부, 주간 사용 가능액, 카드 실적, 고정비·현금흐름, 대출 상환을 함께 관리하는 모바일 우선 PWA입니다.

## 주요 기능

- 오늘 기준 월간 대시보드와 일별·카테고리별 집계
- 직접 거래 입력, 수정, 완전 삭제
- 현대·신한 `.xlsx` 직접 업로드 및 겹치는 기간의 중복 자동 제외
- 승인번호 미수집, 카드 전체번호·비밀번호 미사용
- 모든 카드 거래는 실적 기본 포함, 사용자 제외 거래만 직접 체크 해제
- 현금서비스는 생활비 거래로 분류
- 주간 기본금액 130,000원과 이전 주 잔여/초과 이월
- 고정비 예정/실제액, 현금흐름, 대출 잔액·금리·정기/추가상환액 직접 수정

`public/private-preview-data.json`과 `public/private-preview-config.json`은 개발용 로컬 자료이며 `.gitignore`에 포함되어 있습니다. 공개 GitHub 저장소나 GitHub Pages 결과물에는 포함되지 않습니다.

## 실행

```bash
pnpm install
pnpm dev
```

정적 배포 파일은 `pnpm build` 후 `out/`에 만들어집니다. `main` 브랜치에 변경 사항이 올라오면 `.github/workflows/deploy-pages.yml`이 GitHub Pages를 자동 배포합니다. GitHub Pages에는 공개 가능한 PWA 코드만 두고, 실제 앱은 Google Apps Script를 통해 사용자의 Google Drive JSON 저장소와 통신합니다.

## 데이터 저장 구조

- GitHub Pages: 공개 가능한 PWA 화면 코드
- Google Apps Script: 숫자 비밀번호 로그인, 180일 기기 토큰, 데이터 읽기/저장 API
- Google Drive: 가맹점 상세를 제거한 비공개 집계 JSON
- iPhone: 홈 화면에 설치해 앱처럼 사용

## Apps Script 설치

1. [Google Apps Script](https://script.google.com/)에서 새 프로젝트를 만듭니다.
2. `apps-script/`의 `Code.gs`, `Security.gs`, `Storage.gs`, `Setup.gs`를 같은 이름으로 복사합니다. 프로젝트 시간대는 `Asia/Seoul`로 설정합니다.
3. 프로젝트 설정 → 스크립트 속성에서 `SETUP_ACCESS_TOKEN`에 직접 정한 20자 이상의 초기 토큰과 `SETUP_APP_PASSWORD`에 숫자 6~12자리 비밀번호를 등록합니다. 특정 Drive 폴더를 쓰려면 `FINANCE_FOLDER_ID`도 등록합니다.
4. 편집기 상단 함수 목록에서 `setupFlow`를 선택해 한 번 실행하고 Drive 접근 권한을 승인합니다. 실행 후 평문 설정값은 자동 삭제되고 해시만 남습니다.
5. `배포` → `새 배포` → `웹 앱`을 선택하고, 실행 사용자는 **나**, 접근 권한은 **모든 사용자**로 배포합니다. 실제 데이터는 토큰 없이는 읽거나 저장할 수 없습니다.
6. PWA의 `연결 설정`에서 숫자 비밀번호로 인증합니다. `/exec` 주소는 앱에 기본 포함되어 Safari 데이터를 지워도 자동 복원됩니다.
7. 먼저 PC 미리보기에서 `현재 데이터를 Drive에 저장`을 누른 뒤, iPhone에서는 같은 숫자 비밀번호로 인증해 불러옵니다.

Apps Script `/exec` 주소는 비밀키가 아니므로 근력운동 PWA와 같은 방식으로 공개 앱 코드에 기본값을 둡니다. 데이터 접근 권한은 숫자 비밀번호와 만료되는 기기 토큰으로 보호합니다. 비밀번호 원문, Drive 파일·폴더 ID, 실제 거래·예산·대출 정보는 GitHub에 커밋하지 않습니다.

기존 설치를 이 방식으로 바꿀 때는 스크립트 속성 `SETUP_APP_PASSWORD`에 숫자 6~12자리를 넣고 `configureFlowPassword`를 실행한 뒤 새 버전으로 재배포합니다. 새 PIN 로그인이 정상 작동하는 것을 확인한 뒤 `disableLegacyFlowToken`을 실행하면 이전 20자 토큰 인증이 중단됩니다.

기존 Drive JSON에 가맹점 상세가 남아 있다면 `purgeStoredTransactionDetails`를 한 번 실행합니다. 이후 저장되는 거래에는 `날짜·금액·카테고리·결제수단·집계 체크값`만 남고 가맹점명·결제시각·메모·업로드 파일명은 제거됩니다.

## iPhone 설치

GitHub Pages 주소를 Safari로 연 뒤 공유 버튼 → `홈 화면에 추가`를 선택합니다. 첫 실행에서 `연결 설정`에 숫자 비밀번호를 입력합니다. Safari 데이터를 지워도 Apps Script 주소는 앱에서 자동 복원되며 숫자 비밀번호로 다시 인증하면 됩니다.
