# Controle de combustível MACER

Aplicativo próprio em React, TypeScript, Firebase Authentication e Cloud Firestore (NoSQL). Não utiliza Google Sheets ou SQL Connect.

## Estado atual

Implementados: login/logout, perfis por unidade, cadastro de ativos e tanques pelo administrador, recebimento pelo responsável, abastecimento pelo comboísta, estoque por tanque e histórico recente. Transações gravam movimento, saldo e leitura juntos. Regras Firestore verificam o mesmo vínculo no servidor. Reenvio com o mesmo UUID não duplica a baixa; envio sem confirmação fica recuperável no aparelho.

Ainda não implementados: transferência, estorno, fechamento diário, importação histórica, fotos, valorização financeira e operação offline. Nesta etapa cada ativo tem um produto e medidor; múltiplos produtos/medidores por ativo serão incorporados antes da migração da frota. Cadastros não possuem edição/inativação pela interface ainda. Consultas carregam até 200 ativos/tanques e as últimas 50 operações, limites informados na tela. A regra de competência 21–20 existe com testes, mas relatórios por competência ainda não foram implementados. Esta versão precisa de homologação antes do uso real.

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
