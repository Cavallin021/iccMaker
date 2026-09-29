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
