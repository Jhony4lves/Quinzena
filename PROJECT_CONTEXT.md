# Contexto permanente do projeto Quinzena

## Objetivo

Construir e lançar o Quinzena como produto digital comercial para pessoas que recebem renda em duas datas e precisam organizar contas por ciclo de pagamento.

## Autonomia de desenvolvimento

O ChatGPT está autorizado pelo proprietário do projeto a tomar decisões de produto, design, UX/UI, código, arquitetura e estratégia sem solicitar aprovação para cada decisão. Deve priorizar qualidade, integridade financeira, simplicidade mobile-first e velocidade de entrega.

Intervenção do proprietário só é necessária quando a ação depende dele, como pagamentos, credenciais, cadastros externos, autorizações de terceiros ou informações que somente ele possua.

## Deadline

**10/09/2026 — lançamento comercial.**

O prazo é tratado como data de lançamento, não como data para “beta quase pronta”.

## Segurança do repositório

Este repositório é público. Portanto:

- nunca versionar credenciais, tokens, chaves, senhas ou segredos;
- nunca versionar dados financeiros/pessoais reais do proprietário ou de usuários;
- usar apenas dados fictícios em exemplos e testes;
- manter `.env` e backups reais fora do Git;
- segredos de automação/deploy devem usar mecanismos próprios de secrets da plataforma;
- nenhuma licença open source é concedida enquanto não houver decisão explícita nesse sentido.

## Regra de produto

Integridade financeira vence conveniência visual. Qualquer bug capaz de apresentar saldo incorreto é bloqueador de lançamento.
