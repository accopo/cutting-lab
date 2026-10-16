"""Negative publication checks: reject stale data and changed solver bytes."""
from pathlib import Path
import json
import shutil
import tempfile
import unittest
import build_site
from scripts.audit_distribution import audit
from scripts.verify_static_build import verify
ROOT=Path(__file__).resolve().parents[1]

class PublicationChecks(unittest.TestCase):
    def test_real_distribution_integrity(self):
        result=verify(ROOT/'dist')
        self.assertEqual(result['public_inputs'],5)
        self.assertFalse(result['private_artifacts'])
    def test_stale_or_private_sample_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);shutil.copytree(ROOT/'data',root/'data');(root/'static/vendor').mkdir(parents=True)
            original=json.loads((ROOT/'static/vendor/browser-data.json').read_text(encoding='utf-8'))
            altered=json.loads(json.dumps(original));altered['datasets']['shirts']['items'][0]['polygon'][0][0]+=1
            (root/'static/vendor/browser-data.json').write_text(json.dumps(altered),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'differs'):audit(root)
            altered=json.loads(json.dumps(original));altered['datasets']['private-order']={'source':{'kind':'user'}}
            (root/'static/vendor/browser-data.json').write_text(json.dumps(altered),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'differs'):audit(root)
    def test_upstream_provenance_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);shutil.copytree(ROOT/'data',root/'data');(root/'static/vendor').mkdir(parents=True)
            shutil.copy2(ROOT/'static/vendor/browser-data.json',root/'static/vendor/browser-data.json')
            path=root/'data/normalized/shirts.json';value=json.loads(path.read_text(encoding='utf-8'));value['source_sha256']='0'*64;path.write_text(json.dumps(value),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'provenance'):audit(root)
    def test_changed_solver_or_missing_license_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            static=Path(tmp);folder=static/'vendor/packingsolver';shutil.copytree(ROOT/'static/vendor/packingsolver',folder)
            build_site.verify_solver(static)
            module=folder/'packingsolver.wasm';original=module.read_bytes();module.write_bytes(original[:-1]+bytes([original[-1]^1]))
            with self.assertRaisesRegex(ValueError,'hash mismatch'):build_site.verify_solver(static)
            module.write_bytes(original);(folder/'dependency-licenses/musl.txt').unlink()
            with self.assertRaisesRegex(ValueError,'license'):build_site.verify_solver(static)

if __name__=='__main__':unittest.main()
