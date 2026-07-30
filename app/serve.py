"""简易静态服务器，用于 cloudflared 隧道测试 PWA。
不做 host 检查（vite preview 的 allowedHosts 在该版本不生效），仅本机测试用。
"""
import http.server
import socketserver
import os

PORT = 4173
DIR = os.path.join(os.path.dirname(__file__), "dist")

os.chdir(DIR)

# 关键 MIME：service worker 必须是 application/javascript，且 scope 正确
Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".html": "text/html; charset=utf-8",
})

# 允许跨域（cloudflared 转发）
class CORSHandler(Handler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # service worker scope：允许在 / 下注册
        if self.path.endswith("sw.js"):
            self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), CORSHandler) as httpd:
    print(f"serving {DIR} on :{PORT}")
    httpd.serve_forever()
