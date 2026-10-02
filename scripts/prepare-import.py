"""Read the original XLSX without applying filters or changing it; create a local review package."""
import argparse, collections, datetime, hashlib, json, re, zipfile
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
LAYOUTS = {
    'CA111': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'CA101': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'Reserv. Marcos Adriano': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'Reserv. Romário': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'Reserv. BASE': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'GTM': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'CONTROLE ARLA': ('M', 'P', 'E', 'D', 'J', 'L', 'N', 'O', 'Q'),
    'RESERVATORIO (MC101)': ('N', 'Q', 'E', 'D', 'K', 'M', 'O', 'P', 'R'),
    'CA-02': ('L', 'K', 'E', 'D', 'I', '', '', '', ''),
    'CA-03': ('L', 'K', 'E', 'D', 'I', '', '', '', ''),
    'CA-105': ('L', 'K', 'E', 'D', 'I', '', '', '', ''),
    'Vetorial': ('H', 'G', 'D', 'C', 'E', '', '', '', ''),
}

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def number(value):
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except InvalidOperation:
        return None

def read_book(path):
    with zipfile.ZipFile(path) as z:
        book = ET.fromstring(z.read('xl/workbook.xml'))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        shared = [ ''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
        result = {}
        for sheet in book.findall('s:sheets/s:sheet', NS):
            target = rels[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(z.read(target)).findall('s:sheetData/s:row', NS):
                cells, errors = {}, []
                for cell in row.findall('s:c', NS):
                    value = cell.find('s:v', NS)
                    text = value.text if value is not None and value.text else ''
                    if cell.get('t') == 's': text = shared[int(text)] if text else ''
                    if cell.get('t') == 'inlineStr': text = ''.join(cell.find('s:is', NS).itertext())
                    column = re.sub(r'\d+', '', cell.get('r'))
                    if text: cells[column] = text
                    if cell.get('t') == 'e': errors.append(cell.get('r') + ': ' + text)
                if cells: rows.append((int(row.get('r')), cells, errors))
            result[sheet.get('name')] = {'state': sheet.get('state', 'visible'), 'rows': rows}
        properties = book.find('s:workbookPr', NS)
        return result, properties is not None and properties.get('date1904') in ['1', 'true']

def prepare(path):
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    book, date1904 = read_book(path)
    origin = datetime.datetime(1904, 1, 1) if date1904 else datetime.datetime(1899, 12, 30)
    records, rejected, catalogs, counts = [], [], [], []
    for sheet_name, sheet in book.items():
        if sheet_name in ['CADASTRO', 'CAD PLACAS']:
            for row, c, errors in sheet['rows']:
                if row < (4 if sheet_name == 'CADASTRO' else 2) or not c.get('B'): continue
                if sheet_name == 'CADASTRO':
                    p = dict(code=c.get('B',''), unit=c.get('C',''), type=c.get('D',''), model=c.get('E',''), plate=c.get('F',''), owner=c.get('G',''), ownership=c.get('H',''), status=c.get('K',''), consumptionHint=c.get('L',''))
                else:
                    p = dict(code=c.get('B',''), unit=c.get('A',''), type=c.get('D',''), model=c.get('H',''), plate=c.get('I',''), owner=c.get('N',''), ownership=c.get('L',''), status=c.get('P',''), productHint=c.get('J',''))
                catalogs.append({**p, 'sourceSheet': sheet_name, 'sourceRow': row, 'issues': errors + ['Confirmar capacidade por combustível e leitura inicial antes de ativar.']})
            continue
        if sheet_name not in LAYOUTS: continue
        incoming, outgoing, code, author, reading, nf, price, total_in, total_out = LAYOUTS[sheet_name]
        headers = next((c for r,c,e in sheet['rows'] if r == 4), {})
        unit_column = next((column for column,value in headers.items() if value.strip().upper() == 'CR'), '')
        summary = {'sheet': sheet_name, 'state': sheet['state'], 'records': 0, 'inMl': 0, 'outMl': 0}
        for row, c, errors in sheet['rows']:
            if row < 5: continue
            for column, kind in [(incoming, 'legacy-in'), (outgoing, 'legacy-out')]:
                value = number(c.get(column, ''))
                if value is None or value == 0: continue
                quantity = value * 1000
                date_value = number(c.get('B',''))
                if value < 0 or quantity > 1e9 or date_value is None or not 40000 < date_value < 50000:
                    rejected.append({'sourceSheet': sheet_name, 'sourceRow': row, 'sourceColumn': column, 'cells': c, 'reason': 'Quantidade ou data inválida; conferir a origem.'})
                    continue
                issues = list(errors)
                if quantity != quantity.to_integral_value(): issues.append('Quantidade arredondada para mililitros; conferir precisão da origem.')
                if not c.get(code): issues.append('Código de veículo/destino não informado na origem.')
                if re.search('RESERV|TRANSFER|DEVOLU', c.get(code,'').upper()): issues.append('Movimento de reservatório/transferência: não classificar como consumo do veículo.')
                if kind == 'legacy-out' and not c.get(reading): issues.append('Leitura não informada na origem.')
                if sheet['state'] != 'visible': issues.append('Aba oculta no arquivo original.')
                if sheet_name != 'CONTROLE ARLA': issues.append('Tipo de diesel não especificado na origem.')
                if not c.get(unit_column) or c.get(unit_column, '').startswith('#'): issues.append('CR original ausente ou com erro; conferir a unidade manualmente.')
                issues = issues[:10]
                record = dict(kind=kind, businessDate=(origin + datetime.timedelta(days=float(date_value))).date().isoformat(), quantityMl=int(quantity.quantize(Decimal('1'),rounding=ROUND_HALF_UP)), assetId=c.get(code,'')[:100], personName=c.get(author,'')[:100], legacyReading=c.get(reading,'')[:100], reference=c.get(nf,'')[:120] if nf else '', unitPriceText=c.get(price,'')[:100] if price else '', totalText=c.get(total_in if kind == 'legacy-in' else total_out,'')[:100] if (total_in if kind == 'legacy-in' else total_out) else '', product='arla32' if sheet_name == 'CONTROLE ARLA' else 'diesel-nao-especificado', sourceSheet=sheet_name, sourceRow=row, sourceColumn=column, issues=issues)
                record['id'] = digest('MACER-XLSX|' + sheet_name + '|' + str(row) + '|' + column)
                record['sourceUnit'] = c.get(unit_column, '')[:100]
                record['sourcePersonLabel'] = headers.get(author, '')[:40]
                records.append(record)
                summary['records'] += 1
                summary['inMl' if kind == 'legacy-in' else 'outMl'] += record['quantityMl']
        counts.append(summary)
    normalized = collections.defaultdict(list)
    for p in catalogs:
        normalized[re.sub(r'[^A-Z0-9]', '', p['code'].upper())].append(p)
    for group in normalized.values():
        if len(group) > 1:
            for p in group: p['issues'].append('Código repetido ou equivalente entre cadastros; conferir placa e unidade.')
    return dict(format='macer-archive-v1', sourceName=path.name, sourceHash=source_hash, generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), records=records, catalogs=catalogs, rejected=rejected, summary=counts)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    package = prepare(args.source)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'sourceHash': package['sourceHash'], 'records': len(package['records']), 'catalogProposals': len(package['catalogs']), 'rejected': len(package['rejected']), 'summary': package['summary']}, ensure_ascii=False))
