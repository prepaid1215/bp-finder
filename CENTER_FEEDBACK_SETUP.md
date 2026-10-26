# BP FINDER — 센터 접수 경험 기능 (개발 브랜치)

## 목적
센터별 팩스/카카오채널 접수 경험, 운영시간 경험과 확인 날짜를 공유합니다.
`data/centers.json`에 있는 고유 `id`에 연결하므로 센터명/전화가 갱신돼도 기록을 유지합니다.

## 사용자 화면
- 센터 찾기 결과 카드: **센터 운영정보 · 이용후기**
- 방문 개통 요청서 화면: **센터 접수 경험 공유**
- 항목: 신청서 접수 방식(직접 입력 가능), 운영시간(자유 입력), 확인 날짜(오늘 기본), 코멘트 5~400자
- 자동 승인된 후기 30건을 최신순 조회
- **등록 직후 자동 공개**. 관리자 승인 대기 및 알림은 현재 사용하지 않음.
- 서류 이미지 저장은 실제 센터 접수 확인을 의미하지 않음. 정보는 작성자의 경험입니다.

## 최초 설정 (운영 반영 전 필수)
1. Supabase 프로젝트 생성.
2. Supabase SQL Editor에 `data/center-feedback.sql`의 SQL을 실행.
3. Vercel 프로젝트 환경변수에 아래 3개를 설정 (Production 및 Preview 각각 필요한 환경):
   - `SUPABASE_URL` = Supabase Project URL
   - `SUPABASE_SECRET_KEY` = Supabase **secret API key** (`sb_secret_...`, recommended as of 2026)
     - Legacy `SUPABASE_SERVICE_ROLE_KEY` is supported as a fallback only.
     - In Supabase: Project Settings → API Keys → Secret keys. This value must **never** appear in the repository, client-side files, or chat.
   - `FEEDBACK_HASH_SALT` = 충분히 긴 난수 문자열 (IP 해시 생성용)
4. Vercel Preview에서 제출 → Supabase `bp_center_feedback` 테이블에 `approved`로 바로 저장 확인.
5. 등록한 센터의 공개 목록에서 **즉시** 보이는지 확인.
6. 허위 정보나 개인정보가 있다면 Supabase Table Editor에서 `status`를 `rejected`로 변경해 공개 중단.
7. 2곳 이상 센터를 시험하고 기존 센터찾기/서류작성/지도/모바일 UI 회귀 확인 뒤에만 main 병합.

## 데이터 보호
- 브라우저에서 Supabase에 직접 접근하지 않음. 서비스 역할 키는 Vercel 서버 환경변수에만 보관.
- RLS를 켜고 익명 읽기/쓰기 정책을 만들지 않음.
- API에는 성명·휴대폰번호·생년월일·신청서 파일을 보내지 않음.
- 이 기능은 기존 `sendLog()` 기록 기능과 분리되며, 기존 로깅 로직을 변경하지 않음.
- 사용자가 코멘트에 개인정보를 적지 않도록 고지. 자동 공개이므로 개인정보가 노출될 수 있음. 발견 시 즉시 `rejected`로 변경해야 함.
- IP 원문 대신 비밀 salt가 결합된 해시를 보관; 동일 IP 기준 24시간 3건 제한.
- 자동 봇 차단이나 계정 인증이 있는 것은 아님. 일반 공개 전 추가 남용 방지 검토 필요.
- IP 해시 보존기간을 정책으로 정하고 정리 작업을 실행해야 함 (SQL 파일에 예시 포함).
- 후기 내용은 공식 확정 정보가 아닌 '개인 경험'으로 표시하며, 카카오채널 주소 등 운영정보 확정 전 센터에 직접 확인.

## 주의
- 기능 추가와 PR만으로 데이터베이스/환경변수가 자동 생성되지 않음.
- 3개 환경변수가 없으면 API가 503을 반환해 후기가 표시되지 않음.
- `fetch` 결과(201)만 등록 성공으로 취급. 기존 FAQ의 `no-cors` 성공 오인 문제와 분리.
- 현재 자동 승인 운영이며 관리자 승인 화면/텔레그램·카카오톡 알림은 구현하지 않음. Supabase Table Editor에서 공개 해제가 가능.
- 기존 서류 작성의 명의자 정보, 접수 로그 보관 방식에 관한 개인정보 처리는 별도 검토 대상.

## ChatGPT 연결
Supabase 플러그인을 연결하면 ChatGPT에서 접근 가능한 프로젝트를 확인하고 SQL 테이블 구성을 도울 수 있습니다. 
다만 ChatGPT 플러그인 연결만으로 BP FINDER 서버(Vercel)의 환경변수가 자동 등록되는 것은 아닙니다.
프로젝트 준비 후 Vercel 대시보드에서 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `FEEDBACK_HASH_SALT` 세 값을 **Preview 환경**에 먼저 설정하고 Preview를 재배포해야 합니다. 검증 전에는 Production에 넣지 마세요.

## 검증 과정
- 미설정 환경에서는 API가 503을 반환하는지 확인
- 등록 후 즉시 GET에 노출되는지 확인
- `rejected`로 변경한 글은 GET에 노출되지 않는지 확인
- 실제 팩스/카카오 접수 절차, 서류 다운로드, 지도, FAQ의 기존 기능 정상 작동 확인

## 2026-10-26: 작성자 및 IP 제한
- 최근 24시간 동안 **동일 IP 최대 20건**. 공유 Wi-Fi 사용자는 합산됩니다.
- 요청자 성명은 `requester_name`에 내부 관리용으로 저장합니다. 서류작성의 `in_agent` 값으로만 자동 입력하며, 사용자 수정이 가능합니다. **고객 명의자 이름은 사용하지 않습니다.**
- 공개 후기 목록에는 `익명`으로 표시하고 공개 GET API에서는 `requester_name`을 조회하거나 반환하지 않습니다.
- 계정 인증이 없는 자기 신고 성명이므로 실제 작성자 신원 보증은 아닙니다. 기존 후기의 이름은 소급 확인할 수 없습니다.
