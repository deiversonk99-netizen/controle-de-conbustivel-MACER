"""Synthetic workbook only: no company data in tests or in Git."""
import importlib.util, json, tempfile, unittest, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

spec = importlib.util.spec_from_file_location('prepare_import', Path(__file__).parents[1] / 'scripts/prepare-import.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

def cell(address, value):
    return f'<c r="{address}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'

class PrepareImportTests(unittest.TestCase):
    def test_filtered_hidden_rows_and_negative_adjustments_keep_provenance(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / 'fixture.xlsx'
            with zipfile.ZipFile(file, 'w') as z:
                z.writestr('xl/workbook.xml', f'<workbook xmlns="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="CA111" sheetId="1" r:id="r1"/><sheet name="CADASTRO" sheetId="2" r:id="r2"/></sheets></workbook>')
                z.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>')
                rows = []
                for row, quantity in [(5, '25.6'), (6, '10'), (7, '-140')]:
                    rows.append(f'<row r="{row}" hidden="1">' + ''.join(cell(f'{c}{row}', v) for c,v in [('B','46278'),('Q',quantity),('E','A1'),('K','101,2')]) + '</row>')
                z.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{NS}"><sheetData>{"".join(rows)}</sheetData><autoFilter ref="B4:Q7"/></worksheet>')
                z.writestr('xl/worksheets/sheet2.xml', f'<worksheet xmlns="{NS}"><sheetData><row r="4">{cell("B4","A1")}{cell("C4","Obra teste")}</row><row r="5">{cell("B5","A-1")}</row></sheetData></worksheet>')
            package = module.prepare(file)
            self.assertEqual(len(package['records']), 2)
            self.assertEqual([r['quantityMl'] for r in package['records']], [25600, 10000])
            self.assertEqual(package['summary'][0]['outMl'], 35600)
            self.assertEqual(package['rejected'][0]['sourceRow'], 7)
            self.assertEqual(package['records'][0]['legacyReading'], '101,2')
            self.assertEqual(package['records'][0]['sourceColumn'], 'Q')
            self.assertNotIn('balanceMl', package['catalogs'][0])
            self.assertTrue(any('repetido' in s for s in package['catalogs'][0]['issues']))
            previous = package['records'][0]['id']
            self.assertEqual(module.prepare(file)['records'][0]['id'], previous)
            json.dumps(package)

if __name__ == '__main__': unittest.main()
