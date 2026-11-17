# EVOLAB LIVE — SPEED BACCARAT & CRAZY TIME

에볼루션 라이브 카지노 스타일의 **무료 가상 칩 시뮬레이터**입니다. 실제 금액의 입출금은 없습니다.

## 게임
- **SPEED BACCARAT A / B / C / SALON PRIVÉ VIP** — 4개 라이브 테이블, 테이블마다 독립된 슈·로드맵
- **CRAZY TIME** — 54칸 머니 휠 + TOP SLOT 2릴 + 보너스 4종(Coin Flip / Pachinko / Cash Hunt / Crazy Time)
- **딜러 6명** (Sofia · Elena · Marcus · Chloe · Liam · Viktor) 8~15판마다 자동 로테이션
- 비드 플레이트 · 빅 로드 · 빅 아이 보이 · 스몰 로드 · 콕크로치 피그 + B/P/T 통계 + 다음 판 예측

## 전 세계 동일 결과
모든 라운드는 `(tableId, roundIndex)`에서 결정론적으로 생성됩니다.
`roundIndex = floor(serverNow / ROUND_MS)` 이고 서버 시각은 Supabase `Date` 헤더로 보정됩니다.
같은 시각 같은 테이블에 접속한 모든 플레이어는 동일한 카드·딜러·출목표를 봅니다.

## 계정 · 저장
- Supabase `game_accounts` (SHA-256 해시 비밀번호) 로그인/회원가입 필수
- 잔액 · 충전 횟수 · VIP · 최고 잔고 자동 저장(클라우드 + localStorage 폴백)
- 무료 충전: 1회 1,000,000 / 하루 10회 (VIP `noah2026` 계정은 무제한)
- 랭킹: 일간/주간/월간 최고 잔고, **무료 충전 크레딧 제외** (`baccarat_rankings`)

## 개발
```bash
npm install
npm run dev      # http://localhost:5199/Speed-baccarat/
npm run build    # dist/
```
`vite.config.js` 의 `base: '/Speed-baccarat/'` 로 GitHub Pages 루트 배포에 맞춰져 있습니다.

## 검증
```bash
STAGE=desktop node tests/verify.mjs   # 베팅 → 딜링 → 결과 → 로드맵 (데스크톱)
STAGE=mobile  node tests/verify.mjs   # 390×844 반응형
STAGE=crazy   node tests/verify.mjs   # 크레이지 타임 휠 + 보너스
STAGE=sync    node tests/verify.mjs   # 두 클라이언트 동일 결과
node tests/engine.test.mjs            # 3rd-card 룰 · 정산 · 로드맵 단위 테스트
```
