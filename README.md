# Controle de combustível MACER

Aplicativo próprio em React, TypeScript, Firebase Authentication e Cloud Firestore (NoSQL). Não utiliza Google Sheets ou SQL Connect.

## Estado atual

Implementados nesta versão: login/logout, perfis por unidade, cadastro e inativação de motoristas/ativos/tanques, usuários por unidade, recebimentos, abastecimentos, transferências, saldo inicial, estorno, fechamento diário, pendências com correção auditada, foto opcional, preço/total, histórico paginado, competência 21–20 e exportação CSV para Excel. Transações e regras Firestore preservam estoque e leitura; reenvio com o mesmo UUID não duplica a baixa.

Uso offline por PWA e IndexedDB: primeiro acesso online, sessão e cadastros preparados; lançamentos permanecem no aparelho e são revalidados ao reconectar. A confirmação do servidor é distinta do salvamento local. A atualização requer publicação coordenada das novas regras antes do cliente. Veja [guia da versão, limitações e implantação](docs/operacao-v2.md) e [conferência de escopo](docs/escopo-conferencia.md).

A importação da base histórica não é automática: duplicidades, capacidades, leituras e saldos físicos precisam ser conferidos. As melhorias futuras do PDF (QR, fotos obrigatórias, dashboard avançado, análise h/km e SAP) não fazem parte desta implantação. A homologação deve ocorrer antes de liberar unidades reais.

## Executar

Requer Node.js 24 e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
npm test
npm run build
```

No PowerShell, usar `Copy-Item .env.example .env.local`.

O arquivo de exemplo contém a configuração pública web fornecida pelo proprietário. Ela identifica o projeto e não dá acesso administrativo. Nunca inserir chaves de conta de serviço, tokens privados ou credenciais Admin em variáveis `VITE_`.

## Configuração no Firebase

O código por si só não cria nem habilita serviços. O administrador precisa verificar o projeto, habilitar Authentication com e-mail/senha, criar as contas autorizadas e escolher a localização do Firestore antes de importar dados. O cadastro público não está implementado.

As regras versionadas autorizam somente usuários ativos com unidade e perfil provisionados em `users/{uid}`. Não substituir por regras abertas. Login bem-sucedido não concede permissão sobre dados. Veja [configuração e homologação](docs/configuracao.md).

Publicado na Vercel em 30/09/2026, com Firebase Authentication por e-mail/senha e Firestore Standard em `southamerica-east1`, no plano Spark. Regras e índice composto foram configurados pelo console. O fluxo online foi validado com dados fictícios exclusivamente na unidade `homologacao`: recebimento de 100 L, abastecimento de 25,6 L e saldo persistido de 74,4 L. Acesso anônimo e a outra unidade retornaram HTTP 403. Nenhum dado da planilha foi importado; a liberação das unidades reais depende da homologação do processo.

`firebase.json` mantém uma configuração opcional de Firebase Hosting; a hospedagem em uso é a Vercel, ligada à branch `main`. Não usa App Hosting nem Cloud Functions. Credenciais da conta de teste não são publicadas neste repositório.

## Custo e arquivos

A intenção é permanecer no plano Spark, dentro das cotas vigentes. Não existe promessa de uso ilimitado. Fotos não estão habilitadas: Cloud Storage for Firebase requer Blaze e precisa de decisão específica compatível com a restrição de custo.

Não publicar planilhas, nomes de operadores, placas, custos, dados de clientes ou backups neste repositório público. A importação deve usar arquivos locais e uma etapa de conferência antes de qualquer escrita remota.

Veja [a arquitetura](docs/arquitetura.md) e [a sequência de implementação](docs/implementacao.md).

## Testes das regras

Além dos testes de domínio, a suíte usa Java 21 e o Firestore Emulator, com projeto fictício `demo-macer`:

```sh
npm run test:rules
```

Os testes cobrem gravação atômica, reenvio, concorrência, escopos, histórico imutável, cadastros e lotes adulterados. GitHub Actions executa build, testes de domínio e emulador. Nunca usar o projeto real na suíte.
