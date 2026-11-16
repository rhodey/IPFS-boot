"""Run inside the pin image: python3 /tests/pin.py (no external network needed)."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class S3Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_PUT(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        self.server.uploads.append((self.path, body, dict(self.headers)))
        failed = self.server.fail or self.path == self.server.fail_path
        self.send_response(403 if failed else 200)
        self.send_header('ETag', '"test"')
        self.send_header('Content-Length', '0')
        self.end_headers()


class PinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('pin-dist'):
            raise RuntimeError('Run these tests inside the pin image')
        cls.temp = tempfile.TemporaryDirectory(prefix='pin-tests-')
        cls.root = Path(cls.temp.name)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), S3Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.endpoint = 'http://127.0.0.1:' + str(cls.server.server_port)
        cls.dist = Path('/root/dist')
        cls.dist.mkdir()
        (cls.dist / 'nested').mkdir()
        # Repeated chunks and repeated files exercise deduplication and DAG traversal.
        cls.large = bytes(range(256)) * 3072
        (cls.dist / 'large.bin').write_bytes(cls.large)
        (cls.dist / 'nested' / 'copy.bin').write_bytes(cls.large)
        (cls.dist / 'nested' / 'empty').touch()
        (cls.dist / 'index.html').write_text('<h1>IPFS pin test</h1>')
        (cls.dist / 'sw.js').write_text('self.addEventListener("fetch", () => {})')
        (cls.dist / 'bundle.js').write_text('console.log("bootloader")')
        (cls.dist / 'assets').mkdir()
        (cls.dist / 'assets' / 'favicon.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        (cls.dist / 'assets' / 'style.css').write_text('body { color: black; }')
        (cls.dist / '_redirects').write_text('/* /index.html 200')
        (cls.root / 'aws').write_text(
            '#!/bin/sh\nset -eu\n'
            'if [ "$2" = https://s3.filebase.com ]; then\n'
            '  shift 2\n'
            f'  set -- --endpoint-url {cls.endpoint} "$@"\n'
            'fi\nexec /usr/bin/aws "$@"\n'
        )
        (cls.root / 'aws').chmod(0o755)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        shutil.rmtree(cls.dist)
        cls.temp.cleanup()

    def setUp(self):
        self.server.uploads = []
        self.server.fail = False
        self.server.fail_path = None
        self.env = {k: v for k, v in os.environ.items()
                    if not k.startswith(('pin_', 'AWS_'))}
        self.env.update({
            'PATH': str(self.root) + ':' + os.environ['PATH'],
            'IPFS_PATH': str(self.root / self.id()),
            'AWS_EC2_METADATA_DISABLED': 'true',
            'AWS_PAGER': '',
        })
        self.r2 = {
            'pin_cloudflare_api': self.endpoint + '/r2-test/',
            'pin_cloudflare_access': 'r2-access',
            'pin_cloudflare_secret': 'r2-secret',
        }
        self.filebase = {
            'pin_filebase_bucket': 'filebase-test',
            'pin_filebase_access': 'filebase-access',
            'pin_filebase_secret': 'filebase-secret',
        }

    def pin(self, config, success=True, args=()):
        result = subprocess.run(['pin-dist', *args], env={**self.env, **config},
                                capture_output=True, text=True, timeout=90)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('done:', result.stdout)
            self.cid0 = result.stdout.split('CIDv0 = ')[1].splitlines()[0]
            self.cid1 = result.stdout.split('CIDv1 = ')[1].splitlines()[0]
        else:
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('done:', result.stdout)
        return result

    def ipfs(self, *args, env=None):
        return subprocess.check_output(['ipfs', '--offline', *args],
                                       env=env or self.env, stderr=subprocess.PIPE)

    def check_r2(self, bootloader=False):
        refs = self.ipfs('refs', '-r', '-u', self.cid1).decode().splitlines()
        expected = {self.cid0, self.cid1, *refs}
        uploads = [(path, body, headers) for path, body, headers in self.server.uploads
                   if path.startswith('/r2-test/ipfs/')]
        self.assertEqual(len(uploads), len(expected))
        self.assertEqual({path for path, _, _ in uploads},
                         {'/r2-test/ipfs/' + cid for cid in expected})
        for path, body, headers in uploads:
            self.assertEqual(body, self.ipfs('block', 'get', path.rsplit('/', 1)[1]))
            self.assertEqual(headers['Content-Type'], 'application/vnd.ipld.raw')
            self.assertIn('Credential=r2-access/', headers['Authorization'])
            self.assertIn('/auto/s3/', headers['Authorization'])
        if not bootloader:
            self.assertTrue(all(path.startswith('/r2-test/ipfs/')
                                for path, _, _ in self.server.uploads
                                if path.startswith('/r2-test/')))

    def check_filebase(self):
        uploads = [(path, body, headers) for path, body, headers in self.server.uploads
                   if path.startswith('/filebase-test/')]
        self.assertEqual(len(uploads), 1)
        path, body, headers = uploads[0]
        self.assertEqual(path, '/filebase-test/' + self.cid1)
        self.assertEqual(headers['x-amz-meta-import'], 'car')
        self.assertIn('Credential=filebase-access/', headers['Authorization'])
        self.assertIn('/us-east-1/s3/', headers['Authorization'])
        car = self.root / 'uploaded.car'
        car.write_bytes(body)
        env = {**self.env, 'IPFS_PATH': self.env['IPFS_PATH'] + '-import'}
        self.ipfs('init', env=env)
        self.assertIn(self.cid1.encode(), self.ipfs('dag', 'import', str(car), env=env))
        self.assertEqual(self.ipfs('cat', self.cid1 + '/nested/copy.bin', env=env),
                         self.large)

    def test_cloudflare_only(self):
        self.pin(self.r2)
        self.check_r2()
        self.assertTrue(all(path.startswith('/r2-test/') for path, _, _ in self.server.uploads))

    def test_filebase_only(self):
        self.pin(self.filebase)
        self.check_filebase()
        self.assertEqual(len(self.server.uploads), 1)

    def test_both_providers(self):
        self.pin({**self.r2, **self.filebase})
        self.check_r2()
        self.check_filebase()

    def test_bootloader_uploads_website_and_pins(self):
        result = self.pin({**self.r2, **self.filebase,
                           'pin_cloudflare_api_dev_url': 'https://static.example/'},
                          args=('--boot',))
        self.check_r2(bootloader=True)
        self.check_filebase()
        expected = {
            'index.html': 'text/html',
            'sw.js': 'text/javascript',
            'bundle.js': 'text/javascript',
            'assets/favicon.png': 'image/png',
            'assets/style.css': 'text/css',
        }
        uploads = [(path.removeprefix('/r2-test/'), body, headers)
                   for path, body, headers in self.server.uploads
                   if path.startswith('/r2-test/') and not path.startswith('/r2-test/ipfs/')]
        self.assertEqual(len(uploads), len(expected))
        self.assertEqual({path for path, _, _ in uploads}, set(expected))
        for path, body, headers in uploads:
            self.assertEqual(body, (self.dist / path).read_bytes())
            self.assertEqual(headers['Content-Type'], expected[path])
            self.assertEqual(headers['Cache-Control'], 'no-cache')
            self.assertIn('Credential=r2-access/', headers['Authorization'])
            self.assertIn('/auto/s3/', headers['Authorization'])
        self.assertIn('done: https://static.example/index.html', result.stdout)

    def test_bootloader_validation_uploads_nothing(self):
        self.pin(self.filebase, success=False, args=('--boot',))
        self.pin({**self.filebase, 'pin_cloudflare_access': 'partial'},
                 success=False, args=('--boot',))
        for name in ['index.html', 'sw.js', 'bundle.js',
                     'assets/favicon.png', 'assets/style.css']:
            path = self.dist / name
            content = path.read_bytes()
            try:
                path.unlink()
                self.pin(self.r2, success=False, args=('--boot',))
                path.touch()
                self.pin(self.r2, success=False, args=('--boot',))
            finally:
                path.write_bytes(content)
        self.assertEqual(self.server.uploads, [])

    def test_invalid_arguments_upload_nothing(self):
        for args in [('--unknown',), ('--boot', '--boot'),
                     ('--boot', 'extra')]:
            with self.subTest(args=args):
                self.pin(self.r2, success=False, args=args)
        self.assertEqual(self.server.uploads, [])

    def test_bootloader_upload_failure_is_reported(self):
        self.server.fail_path = '/r2-test/sw.js'
        self.pin({**self.r2, **self.filebase}, success=False,
                 args=('--boot',))
        paths = [path for path, _, _ in self.server.uploads]
        self.assertIn('/r2-test/sw.js', paths)
        self.assertNotIn('/r2-test/index.html', paths)
        self.assertFalse(any(path.startswith('/filebase-test/') for path in paths))

    def test_invalid_configuration_uploads_nothing(self):
        cases = [
            {},
            {'pin_api': self.endpoint, 'pin_token': 'retired'},
            {'pin_cloudflare_access': 'partial'},
            {**self.r2, 'pin_cloudflare_api': self.endpoint},
            {**self.r2, 'pin_cloudflare_api': self.endpoint + '/bucket/extra'},
            {**self.r2, 'pin_cloudflare_api': self.endpoint + '/bucket?query'},
            {**self.r2, 'pin_filebase_bucket': 'partial'},
            {**self.filebase, 'pin_cloudflare_secret': 'partial'},
        ]
        for config in cases:
            with self.subTest(config=config):
                self.pin(config, success=False)
                self.assertEqual(self.server.uploads, [])

    def test_upload_failure_is_reported(self):
        self.server.fail = True
        self.pin({**self.r2, **self.filebase}, success=False)
        self.assertEqual(len(self.server.uploads), 1)
        self.assertTrue(self.server.uploads[0][0].startswith('/r2-test/'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
