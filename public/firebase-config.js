/* ==================================================================
 * Firebase 설정
 * ------------------------------------------------------------------
 * Firebase 콘솔 → 프로젝트 설정 → "내 앱"의 웹 앱에서 가져온 값.
 *
 * 이 값들은 공개돼도 괜찮은 값이야 (비밀번호가 아님).
 * 실제 보안은 Firestore 규칙(firestore.rules)이 담당해.
 * ================================================================== */

export const firebaseConfig = {
  apiKey: "AIzaSyASUG2ukOrJCVpoEPbin0KyzTtcXHjH2Ps",
  authDomain: "class3-72d07.firebaseapp.com",
  projectId: "class3-72d07",
  storageBucket: "class3-72d07.firebasestorage.app",
  messagingSenderId: "419045627198",
  appId: "1:419045627198:web:af539acf173849dfcd486f",
  measurementId: "G-LGR4JQQYC2",
};

/* 반장 모드 비밀번호.
 *
 * 주의: 이건 화면을 정리해 주는 용도일 뿐이야. 이 파일은 브라우저로
 * 내려가니까 마음먹고 찾아보면 누구나 볼 수 있어. 진짜 자물쇠가 아님. */
export const ADMIN_KEY = "Hola guapo!";
