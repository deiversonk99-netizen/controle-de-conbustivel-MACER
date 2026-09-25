# Controle de combustível MACER

Base inicial do aplicativo próprio: React, TypeScript, Firebase Authentication e Cloud Firestore (NoSQL). Não utiliza Google Sheets ou SQL Connect.

## Estado atual

Implementados: estrutura do projeto, configuração Firebase, tela de login/logout por e-mail e senha, regras iniciais que negam acesso ao Firestore, cálculo de competência 21–20 e testes dessa regra.

Ainda não implementados: perfis operacionais, cadastros, abastecimentos, estoque, transferências, fechamento, importação, fotos e sincronização offline. A tela informa essa condição e não apresenta dados fictícios. Esta versão não está pronta para uso operacional.

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

As regras versionadas negam todo acesso aos documentos enquanto as regras operacionais não forem desenvolvidas e testadas. Não substituir por regras abertas. Login bem-sucedido não concede permissão sobre dados.

Não foi realizado deploy nem importação. `firebase.json` prepara Firebase Hosting estático para implantação futura; não usa App Hosting nem Cloud Functions. Deploy requer Firebase CLI autenticada e revisão das regras do projeto existente.

## Custo e arquivos

A intenção é permanecer no plano Spark, dentro das cotas vigentes. Não existe promessa de uso ilimitado. Fotos não estão habilitadas: Cloud Storage for Firebase requer Blaze e precisa de decisão específica compatível com a restrição de custo.

Não publicar planilhas, nomes de operadores, placas, custos, dados de clientes ou backups neste repositório público. A importação deve usar arquivos locais e uma etapa de conferência antes de qualquer escrita remota.

Veja [a arquitetura](docs/arquitetura.md) e [a sequência de implementação](docs/implementacao.md).
