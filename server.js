/**
 * 우리 반 알림장 - 로컬에서 볼 때 쓰는 정적 서버
 * -------------------------------------------------------------
 * 데이터는 전부 Firebase에 있어서, 이 파일은 public/ 폴더의 파일을
 * 그냥 내려주기만 해. 설치할 것 없이 node만 있으면 돌아감.
 *
 * index.html을 file:// 로 직접 열면 브라우저가 모듈 파일을 막아서,
 * 이렇게 http:// 로 띄워야 해.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");

const TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js":   "text/javascript; charset=UTF-8",
  ".css":  "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(ROOT, url === "/" ? "index.html" : url);

    // public/ 바깥 파일은 못 가져가게
    if (!file.startsWith(ROOT)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
      return res.end("그건 안 돼요");
    }

    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
        return res.end("그런 파일 없어요");
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => {
    console.log(`\n  우리 반 알림장  →  http://localhost:${PORT}\n`);
  });
