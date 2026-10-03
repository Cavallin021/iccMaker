# Projeto: iccMaker

## Descrição Geral
O **iccMaker** é uma aplicação dividida em um monorepo contendo uma API (Backend) e uma aplicação Web (Frontend).
O projeto gerencia fluxos relacionados a avisos, cânticos e seleções de apresentações, com integração ao Telegram.

## Arquitetura e Stack Tecnológica
- **Banco de Dados**: MongoDB (hospedado no MongoAtlas em produção).
- **Frontend (`apps/web`)**: Desenvolvido em React com TypeScript e **Tailwind CSS**. Focado em responsividade para funcionar perfeitamente no celular.
- **Backend (`apps/api`)**: Desenvolvido em Node.js/Express com TypeScript. Utiliza Controllers (ex: `noticeController`, `selectionController`, `optionController`) e Services (ex: `telegramService` para comunicação com bots do Telegram).
- **Deploy Atual**: 
  - Banco de Dados: MongoAtlas
  - Backend: Render
  - Frontend: Vercel

## Regras de Negócio e Fluxo Principal
O aplicativo possui duas áreas principais, ambas protegidas por senhas específicas:
1. **Área de Seleção de Cânticos (Comum)**: Área acessada pela maioria dos usuários mediante senha própria para realizar as seleções de cânticos e interagir.
2. **Área do Studio (Admin)**: Acessada apenas por administradores com a senha correta. É a partir do Studio que os admins podem gerenciar e **concluir a apresentação**.

## Diretrizes de Desenvolvimento (Regras Estritas)
1. **TypeScript Fortemente Tipado**: O projeto utiliza TypeScript. **É estritamente proibido o uso de `any`**. A tipagem forte e correta deve ser priorizada sempre.
2. **Design Responsivo (Mobile-first)**: Como o sistema é muito usado no celular, toda nova interface feita no Tailwind deve ser responsiva e adaptada para telas menores.
3. **Execução Local**: Para rodar o projeto em desenvolvimento, utilize o comando `npm run dev`.
4. **Contexto de Monorepo**: Alterações em modelos de dados devem refletir tanto na API quanto nos tipos consumidos pelo Frontend.
5. **Armazenamento em Nuvem e Deploy no Render**: O backend roda no nível gratuito do Render, que possui sistema de arquivos efêmero. **NUNCA** salve arquivos de mídia localmente via Multer (`diskStorage`) de forma persistente. Todas as imagens de cânticos devem ser hospedadas externamente no **Cloudinary** (`cloudinaryService.ts`).
6. **Vercel TypeScript Strictness**: O build no Vercel (Frontend) falhará estritamente (com código 2) caso existam variáveis ou imports não utilizados (TS6133). Sempre limpe variáveis não utilizadas após qualquer refatoração.
7. **Performance do Backend (Geração de PPTX)**: A biblioteca `pptxgenjs` exige muita CPU e memória. No ambiente do Render (Free), gerar um arquivo `.pptx` de forma síncrona apenas para pré-visualizações na UI fará a requisição estourar a memória (timeout/crash). Utilize a flag `skipPptx=true` em `buildPresentationFiles` sempre que o objetivo for gerar apenas o PDF para preview. A geração completa do PPTX deve acontecer apenas na finalização do culto.
8. **Padrão de Nomenclatura de Cânticos**: Novos cânticos sempre seguem o padrão de título `"DDD - Nome"` (onde DDD é o número de 3 dígitos com zeros à esquerda, ou `+++` caso não faça parte do hinário). A criação pelo Studio deve sempre forçar essa separação semântica antes de enviar à API.
