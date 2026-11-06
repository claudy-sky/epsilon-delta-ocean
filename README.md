# f(x) — epsilon–delta

수학Ⅲ 교과서와 수업 자료를 바탕으로 함수의 극한을 설명하는 세 페이지 수학 블로그입니다.

- 첫 화면: 군청색 수면, 클릭·드래그에 반응하는 파동과 포말, 스크롤에 따른 분자 장면.
- 정의: 입실론–델타 정의, 교재 보기 16과 조절 가능한 그래프.
- 증명과 반례: 교재 보기 17·18, 수열 판정법.

## 실행과 배포

빌드 과정이나 API 키가 필요하지 않습니다. `dist/`를 정적 HTTP 서버로 제공하면 됩니다.

```sh
python3 -m http.server 8000 --directory dist
```

GitHub Actions는 `main`의 파일을 검사한 다음 `dist/`만 GitHub Pages에 배포합니다. 공개 사이트에는 개발 기록이나 학교 원본 PDF를 올리지 않습니다.

```sh
python3 scripts/check_site.py
node --check dist/ocean.js
node --check dist/water.js
node --check dist/graph.js
```

## 모델과 표시

수면은 FFT 해양 파랑과 비선형 수면 교란을 합성한 근사 모델입니다. 포말은 압축된 파도 마루와 흐름으로 생성하고, 이후 이동·감쇠시킵니다. 물방울 분리나 공기 혼입까지 해석하는 3차원 자유수면 유체 해석은 아닙니다. 분자는 시각적 모형입니다.

모바일에서는 계산 격자와 화면 해상도를 줄이고 프레임 작업량을 제한합니다. 분자는 세 번의 인스턴스 그리기로 표시합니다. 사용하지 않는 장면은 렌더링을 멈추며, 움직임을 줄이는 설정과 일시정지를 지원합니다. 실제 휴대폰별 지속 성능은 별도 확인이 필요합니다.

## 학습 자료

- 이슬비, 『미적분학 첫걸음』 2026년 개정판, 46–47쪽: [교재](https://drive.google.com/file/d/1pBc6aL3g6PqpI-rVQd6xBBY4PMPTdava/view).
- 김백진·이민호, 수학Ⅲ 수업 자료 05 「함수의 극한의 엄밀한 정의」: [수업 자료](https://drive.google.com/file/d/1B8ZrdOwh9py822U7hccYmn6nJkszoFtc/view), [해설판](https://drive.google.com/file/d/18qKsPOFQ1ZJ0eNAOdjhsCDs74QTnSKyk/view).

설명과 그래프를 위 자료의 수학적 정의·예제에 맞춰 새로 구성했습니다. 수업 자료 파일을 복제해 배포하지 않습니다. 개발 과정에 AI를 활용했습니다.

## 외부 코드와 자산

| 자원 | 출처·라이선스 | 포함한 고지 |
|---|---|---|
| Three.js r148 / RGBELoader | Three.js Authors · MIT | `dist/vendor/THREE-LICENSE.txt` |
| FFT 구현 참고 | [David Li](https://github.com/dli/waves) · MIT | `dist/vendor/DAVID-LI-LICENSE.txt` |
| Kloofendal Overcast HDR | [Poly Haven](https://polyhaven.com/a/kloofendal_overcast_puresky) · CC0 | 이 표의 출처 링크 |
| STIX Two Math 서체 | STIX Fonts Project · SIL OFL | `dist/fonts/STIX-OFL.txt` |
| Noto Sans KR | Google Fonts | 원격 서체를 사용하며 시스템 서체로 대체 가능 |

각 외부 자원의 라이선스는 해당 파일에 적용됩니다. 이 저장소는 원래 저작물 전체에 대한 별도의 일괄 라이선스를 추가하지 않습니다.
