# Quinzena

**Seu dinheiro no ritmo do seu pagamento.**

Produto mobile-first para pessoas que recebem salário/adiantamento em duas datas e precisam decidir qual pagamento cobre cada conta.

## Problema

Apps financeiros normalmente tratam renda como um único valor mensal. Para quem recebe em duas datas, isso esconde o problema real: **fluxo de caixa entre pagamentos**.

## Promessa

> Cadastre quanto você recebe, em quais dias e suas contas. O Quinzena mostra automaticamente qual pagamento banca cada vencimento e quanto sobra em cada ciclo.

## MVP atual

- salário líquido e duas datas customizáveis;
- divisões customizáveis, como 70/30 ou 50/50;
- cadastro de contas e categorias;
- alocação automática por ciclo;
- saldo previsto de cada pagamento;
- status de pagamento independente por mês;
- recorrência mensal e despesas de mês único;
- migração dos dados locais da v0.1;
- backup/importação JSON;
- PWA offline/local-first;
- testes automatizados do núcleo financeiro.

## Rodar localmente

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## QA

```bash
node --test tests/core.test.js
node --check core.js
node --check app.js
node --check sw.js
```

## Estratégia comercial inicial

Pagamento único, sem servidor obrigatório. A oferta de lançamento combina o app com materiais bônus distribuídos fora deste repositório público.

**Preço de teste planejado:** R$ 29,90.

## Prazo

Lançamento comercial: **10/09/2026**.

Veja também: [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) e [`docs/ROADMAP.md`](docs/ROADMAP.md).
