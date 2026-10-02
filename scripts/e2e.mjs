import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { chromium, expect } from '@playwright/test';
const environment = {
  ...process.env,
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-macer.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-macer',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-macer.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: 'demo-app',
  VITE_USE_EMULATORS: 'true',
};
execFileSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--mode', 'e2e', '--outDir', 'dist-e2e'],
  {
    env: environment,
    stdio: 'inherit',
  },
);
execFileSync(process.execPath, ['scripts/service-worker.mjs', 'dist-e2e'], { stdio: 'inherit' });
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--outDir',
    'dist-e2e',
    '--host',
    '127.0.0.1',
    '--port',
    '4174',
    '--strictPort',
  ],
  { stdio: 'pipe', windowsHide: true },
);
let browser, env, page;
const failures = [];
try {
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (b) => {
      if (String(b).includes('4174')) resolve();
    });
    server.on('exit', (code) => reject(Error('Preview stopped ' + code)));
    setTimeout(() => reject(Error('Preview timeout')), 20000).unref();
  });
  const signup = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'e2e@example.com',
        password: 'E2e-Only-Password!123',
        returnSecureToken: true,
      }),
    },
  );
  const credential = await signup.json();
  if (!credential.localId) throw Error(JSON.stringify(credential));
  const uid = credential.localId;
  env = await initializeTestEnvironment({
    projectId: 'demo-macer',
    firestore: { host: '127.0.0.1', port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', uid), {
      name: 'Administrador E2E',
      role: 'admin',
      active: true,
      siteIds: ['e2e'],
    });
    await setDoc(doc(db, 'sites', 'e2e', 'tanks', 'T1'), {
      name: 'Tanque E2E',
      product: 'diesel-s10',
      capacityMl: 5000000,
      balanceMl: 100000,
      active: true,
      version: 0,
      lastOperationId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'sites', 'e2e', 'assets', 'A1'), {
      code: 'A1',
      name: 'Máquina E2E',
      plate: 'TESTE',
      product: 'diesel-s10',
      capacityMl: 200000,
      meter: 'hours',
      readingMilli: 100000,
      active: true,
      version: 0,
      lastOperationId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    if (r.url().includes(':4174')) failures.push([r.url(), r.failure()]);
  });
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto('http://127.0.0.1:4174/');
  await page.getByLabel('E-mail', { exact: true }).fill('e2e@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('E2e-Only-Password!123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/Cadastros no aparelho:/)).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Motoristas', exact: true }).click();
  await page.getByLabel('Código', { exact: true }).fill('D1');
  await page.getByLabel('Nome', { exact: true }).fill('Motorista E2E');
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Motorista E2E', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abastecer', exact: true }).click();
  await context.setOffline(true);
  await expect(page.getByText(/Sem internet/)).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Tanque de estoque').selectOption('T1');
  await page.getByLabel('Veículo / equipamento').selectOption('A1');
  await page.getByLabel('Motorista (opcional)').selectOption({ label: 'Motorista E2E · D1' });
  await page.getByLabel('Leitura horímetro (h)', { exact: false }).fill('101');
  await page.getByLabel('Quantidade (litros)').fill('10');
  await page.getByLabel('Preço por litro (R$)').fill('6,12');
  await page.getByLabel('Leitura horímetro (h)', { exact: false }).fill('99');
  await page.getByRole('button', { name: 'Conferir lançamento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('não pode ser menor');
  await page.getByLabel('Leitura horímetro (h)', { exact: false }).fill('101');
  await page.getByLabel('Quantidade (litros)').fill('201');
  await page.getByRole('button', { name: 'Conferir lançamento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('capacidade');
  await page.getByLabel('Quantidade (litros)').fill('10');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Resumo', exact: true }).click();
  await expect(page.getByLabel('Quantidade (litros)')).toHaveValue('10');
  await page.getByRole('button', { name: 'Conferir lançamento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Está tudo certo?' })).toBeVisible();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/mobile-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Voltar e corrigir', exact: true }).click();
  await expect(page.getByLabel('Quantidade (litros)')).toHaveValue('10');
  await page.getByRole('button', { name: 'Conferir lançamento', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Pendências (1)', exact: true }).click();
  await expect(page.getByText(/Aguardando envio/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Sem internet/)).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Pendências (1)', exact: true }).click();
  await expect(page.getByText(/Aguardando envio/)).toBeVisible();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/mobile-offline.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await context.setOffline(false);
  await expect(page.getByText(/Abastecimento · 10 L · Confirmado/)).toBeVisible({ timeout: 60000 });
  await env.withSecurityRulesDisabled(async (ctx) => {
    expect(
      (await getDoc(doc(ctx.firestore(), 'sites', 'e2e', 'tanks', 'T1'))).data().balanceMl,
    ).toBe(90000);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Pendências (0)', exact: true }).click();
  await expect(page.getByText(/Abastecimento · 10 L · Confirmado/)).toBeVisible();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Abastecimento.*Diesel S10/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-history.png', fullPage: true });
  // A stale offline input must be preserved without changing stock when the server has a newer meter.
  await page.getByRole('button', { name: 'Abastecer', exact: true }).click();
  await context.setOffline(true);
  await page.getByLabel('Tanque de estoque').selectOption('T1');
  await page.getByLabel('Veículo / equipamento').selectOption('A1');
  await page.getByLabel('Leitura horímetro (h)', { exact: false }).fill('102');
  await page.getByLabel('Quantidade (litros)').fill('1');
  await page.getByRole('button', { name: 'Conferir lançamento', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e salvar', exact: true }).click();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'sites', 'e2e', 'assets', 'A1'), { readingMilli: 105000 });
  });
  await page.getByRole('button', { name: 'Pendências (1)', exact: true }).click();
  await context.setOffline(false);
  await expect(page.getByText(/Abastecimento · 1 L · Conferência necessária/)).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole('button', { name: 'Tratar pendência' })).toBeVisible({
    timeout: 30000,
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    expect(
      (await getDoc(doc(ctx.firestore(), 'sites', 'e2e', 'tanks', 'T1'))).data().balanceMl,
    ).toBe(90000);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Pendências (1)', exact: true }).click();
  await expect(page.getByText(/Abastecimento · 1 L · Conferência necessária/)).toBeVisible();
  await page.getByRole('button', { name: 'Usuários', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Operador E2E');
  await page.getByLabel('E-mail', { exact: true }).fill('operator-e2e@example.com');
  await page.getByLabel('Senha inicial (somente nova conta)').fill('E2e-Operator-Password!123');
  await page.getByLabel('Motivo', { exact: true }).fill('Teste automatizado de provisionamento');
  await page.getByRole('button', { name: 'Criar / liberar usuário', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Operador E2E/ })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Administrador · Administrador E2E', { exact: true })).toBeVisible();
  // A historical import must never consume the current stock and is readable offline after loading.
  await page.getByRole('button', { name: 'Implantação / planilha', exact: true }).click();
  const archive = {
    format: 'macer-archive-v1',
    sourceName: 'arquivo-ficticio.xlsx',
    sourceHash: 'b'.repeat(64),
    catalogs: [],
    rejected: [],
    summary: [{ sheet: 'Aba teste', state: 'visible' }],
    records: [
      {
        id: 'a'.repeat(64),
        kind: 'legacy-out',
        businessDate: '2025-02-13',
        quantityMl: 25600,
        assetId: 'LEGADO-E2E',
        operatorName: 'Origem fictícia',
        legacyReading: '99,5',
        reference: '',
        unitPriceText: '',
        totalText: '',
        product: 'diesel-nao-especificado',
        sourceSheet: 'Aba teste',
        sourceRow: 9,
        sourceColumn: 'Q',
        issues: [],
      },
    ],
  };
  await page.getByLabel('Pacote de conferência (.json)').setInputFiles({
    name: 'conferencia-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await expect(page.getByLabel('Importar aba Aba teste')).not.toBeChecked();
  await page.getByLabel('Importar aba Aba teste').check();
  await page.getByLabel(/Confirmei que todas as abas selecionadas/).check();
  await page.getByRole('button', { name: 'Importar histórico conferido (1)', exact: true }).click();
  await expect(page.getByText(/1 importados; 0 já existentes/)).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Importar histórico conferido (1)', exact: true }).click();
  await expect(page.getByText(/0 importados; 1 já existentes/)).toBeVisible({ timeout: 30000 });
  await page
    .getByRole('button', { name: 'Carregar / atualizar histórico da planilha', exact: true })
    .click();
  await expect(page.getByRole('cell', { name: 'LEGADO-E2E', exact: true })).toBeVisible();
  await env.withSecurityRulesDisabled(async (ctx) => {
    expect(
      (await getDoc(doc(ctx.firestore(), 'sites', 'e2e', 'tanks', 'T1'))).data().balanceMl,
    ).toBe(90000);
    expect(
      (await getDoc(doc(ctx.firestore(), 'sites', 'e2e', 'assets', 'A1'))).data().readingMilli,
    ).toBe(105000);
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Implantação / planilha', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'LEGADO-E2E', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Carregar / atualizar histórico da planilha', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await page.screenshot({ path: 'test-results/mobile-archive-offline.png', fullPage: true });
  await context.setOffline(false);
  expect(errors).toEqual([]);
  console.log(
    'E2E PASS: mobile driver registration, local validation, review/correction, unsaved-form protection, durable offline queue, offline reload, automatic sync, exact single debit, server conflict preserved without stock change, responsive width and user provisioning.',
  );
} catch (e) {
  if (page) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/e2e-failure.png', fullPage: true });
    console.error('PAGE:', await page.locator('body').innerText(), 'FAILURES:', failures);
  }
  throw e;
} finally {
  await browser?.close();
  await env?.cleanup();
  server.kill();
}
