# Desktop Cat

Electron, React, Vite로 만든 투명 데스크톱 고양이 앱입니다. 작은 고양이가 바탕화면 위를 돌아다니고, 집과 장난감, 음식, 발자국, 장난 기능을 통해 데스크톱 위에서 가볍게 상호작용할 수 있습니다.

## 주요 기능

- 데스크톱 위에서 움직이는 고양이
- 고양이가 돌아갈 수 있는 집 스프라이트
- 고양이 이름 변경
- 발자국 표시와 정리
- 음식과 간식 생성
- 똥 생성과 청소
- Goose Carry Prank
- 랜덤 레이저와 직접 레이저
- 실뭉치 장난감
- 박스 장난감
- 캣닢 장난감
- 고양이 삭제
- 최대 고양이 수 제한
- 안전모드와 조용한 모드

## 개발 실행

```bash
npm install
npm run dev
```

`npm run dev`는 Vite 개발 서버와 Electron 앱을 함께 실행합니다.

## 빌드

```bash
npm run build
```

## exe 생성

Windows 배포 파일은 electron-builder로 생성합니다.

```bash
npm run dist:win:portable
npm run dist:win:installer
```

결과물은 `release/` 폴더에 생성됩니다.

## GitHub 업로드 주의사항

- `release/`, `dist/`, `node_modules/`는 GitHub 소스 저장소에 올리지 않습니다.
- `*.exe`, `*.msi`, `*.zip` 같은 배포 결과물은 저장소가 아니라 GitHub Release에 따로 올리는 것을 권장합니다.
- Windows SmartScreen 경고가 표시될 수 있습니다.
- Goose 커서 장난은 native module, 권한, 실행 환경에 따라 비활성화되거나 fallback으로 동작할 수 있습니다.
- 앱 설정은 Electron `userData` 경로의 AppData 폴더에 저장됩니다.

## 앱이 렉 걸릴 때 수동 초기화

1. 작업 관리자에서 Desktop Cat을 종료합니다.
2. `Win + R`을 누릅니다.
3. `%APPDATA%`를 입력합니다.
4. `Desktop Cat` 또는 `desktop-cat-electron` 폴더를 찾습니다.
5. `settings.json`을 삭제합니다.
6. 앱을 다시 실행합니다.

## 프로젝트 구조

- `src/`: React UI와 애니메이션/상태 로직
- `electron/`: Electron main/preload와 데스크톱 창 제어
- `assets/`: 실제 앱에서 사용하는 이미지 에셋
- `scripts/`: 개발 실행 및 보조 스크립트
- `release/`: 패키징 결과물, Git에는 포함하지 않음

## 유지되는 주요 에셋

- `assets/pets/cat/pet-cats-pack/`
- `assets/house/house.svg`
- `assets/effects/footprint.svg`
- `assets/food/`
- `assets/poop/poop.svg`
- `assets/toys/`
