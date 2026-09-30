# A static server that never lets the browser cache: python3 -m http.server keeps
# serving old ES modules after an edit. Usage: python3 tools/nocache.py 4830
import http.server, sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


http.server.ThreadingHTTPServer(('', int(sys.argv[1])), Handler).serve_forever()
