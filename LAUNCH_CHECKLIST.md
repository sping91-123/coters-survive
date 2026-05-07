# Launch Checklist

차트 레이더 Beta를 도메인에 올리기 전 마지막 확인용 체크리스트입니다.

## 1. 도메인

1. 도메인을 구매합니다.
2. Vercel 프로젝트에 도메인을 연결합니다.
3. Vercel이 안내하는 DNS 레코드를 도메인 관리 페이지에 추가합니다.
4. `https://도메인` 접속과 SSL 인증서 발급을 확인합니다.

## 2. Vercel 환경변수

Vercel Project Settings → Environment Variables에 아래 값을 넣습니다.

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.kr
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
NEXT_PUBLIC_PRO_PAYMENT_URL=
OPENAI_API_KEY=
```

`NEXT_PUBLIC_PRO_PAYMENT_URL`은 자동 카드결제 전에는 비워도 됩니다.
결제 링크를 넣으면 `/pro/apply` 신청 완료 화면에 결제 버튼이 표시됩니다.

## 3. Supabase Auth 설정

Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://your-domain.kr`
- Redirect URLs:
  - `https://your-domain.kr/auth/callback`
  - `http://127.0.0.1:3000/auth/callback`

Google OAuth 설정에서도 Supabase가 제공하는 callback URL이 등록되어 있어야 합니다.

## 4. 공개 전 필수 페이지

아래 페이지가 모두 200으로 열리는지 확인합니다.

- `/survival`
- `/pro`
- `/pro/apply`
- `/report`
- `/terms`
- `/privacy`
- `/refund`
- `/robots.txt`
- `/sitemap.xml`

## 5. 유료 베타 운영 문구

정식 결제 자동화 전에는 “수동 승인형 유료 베타”로만 모집합니다.

권장 문구:

> PRO 베타는 월 19,900원입니다. 자동결제 연결 전까지는 신청 후 운영자가 수동으로 결제 안내와 권한 적용을 진행합니다. 이 서비스는 매수·매도 신호나 수익 보장을 제공하지 않으며, 진입 전 리스크 점검과 복기를 위한 교육용 도구입니다.

## 6. 공개 후 바로 볼 지표

- `/pro/apply` 신청 수
- 신청 후 실제 결제 전환 수
- `/survival`에서 PRO 클릭률
- 복기 저장 수
- 후보 저장 후 W/L/BE 기록 수

처음 20명은 매출보다 피드백이 더 중요합니다.
