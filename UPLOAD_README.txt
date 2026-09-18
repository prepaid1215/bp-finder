BP FINDER Vercel 최종 수정본

GitHub 업로드 위치

1) 교체
/tools/delivery/index.html

2) 교체
/api/dhero.js

3) vercel.json
현재 저장소에 이미 동일한 서울 리전 설정이 있다면 그대로 두어도 됩니다.
ZIP의 vercel.json으로 교체해도 됩니다.

새 구조
bp-finder.vercel.app
→ /api/dhero
→ https://preplan.site/.../dhero-proxy.php
→ N텔레콤 실제 배송판정 API

이유
- Vercel에서 N텔레콤 API 직접 호출 시 20초 타임아웃 발생
- preplan.site PHP에서 N텔레콤 API 호출은 HTTP 200 / N2 정상 확인됨
- 따라서 Vercel은 preplan.site 프록시를 중계하도록 변경

배송 판정
Y  = 당일배송 가능
N2 = 당일배송 불가 / 2~3일 배송
N  = 오류/확인 필요

지역명 1차 판정
- 공식 공지 지역표 기준
- 해운대/해운대구 등 부산 14개 구는 상세주소 없이 가능지역 안내
- 여수 등 일부지역은 상세주소 검색 후 실제 API 최종 판정
- 공지상 가능지역도 우편번호 예외가 있을 수 있으므로 상세주소 직접 입력 시 API 결과 우선
