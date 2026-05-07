# 차트 레이더 Beta

진입 전 차트 구조와 포지션 리스크를 먼저 점검하는 매매 리스크 판독 도구입니다.

이 서비스는 투자 자문, 매수·매도 신호, 수익 보장, 자동매매를 제공하지 않습니다.
핵심 가치는 사용자가 진입 전 후보, 무효화 기준, 손절폭, 복기 기록을 반복해서 확인하게 만드는 것입니다.

## 주요 페이지

- `/survival` - 실시간 차트 판독과 차트 레이더
- `/diagnosis` - 진입 전 리스크 진단
- `/calculator` - 포지션/손익비 계산
- `/journal` - 복기 저장
- `/report` - 백테스트 검증 리포트
- `/pro` - PRO 베타 상품 안내
- `/pro/apply` - PRO 베타 신청
- `/terms` - 이용약관
- `/privacy` - 개인정보 처리방침
- `/refund` - 환불 및 베타 운영정책

## 개발

```bash
npm install
npm run dev
```

## 검증

```bash
npm run lint
npm run build
```

## 배포

도메인 연결과 Vercel/Supabase 환경변수 설정은 `LAUNCH_CHECKLIST.md`를 확인하세요.

필수 환경변수 예시는 `.env.example`에 있습니다.
