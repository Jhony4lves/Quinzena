# Roadmap até 10/09/2026

## Fase 1 — Núcleo confiável (28–31/08)
- [x] Definir nicho e posicionamento.
- [x] Criar identidade provisória e tagline.
- [x] MVP funcional local-first.
- [x] Corrigir saldo que era liberado indevidamente ao marcar conta paga.
- [x] Status de pagamento por competência mensal.
- [x] Recorrência mensal sem carregar “paga” para o mês seguinte.
- [x] Migração da v0.1.
- [x] Testes unitários do núcleo financeiro.
- [x] Onboarding guiado.
- [ ] QA real no Chrome Android.

## Fase 2 — Pacote vendável (01–04/09)
- [x] Planilha bônus criada localmente (não publicar no repositório público).
- [x] Guia PDF curto criado localmente (não publicar no repositório público).
- [x] Dados de demonstração seguros.
- [x] Exportação CSV.
- [x] Política de privacidade provisória.
- [ ] Revisão jurídica/comercial básica da política e termos.

## Fase 3 — Comercial (05–07/09)
- [x] Landing page v0.1 local.
- [ ] Imagens/mockups da oferta.
- [ ] Checkout/plataforma de venda.
- [ ] Descrição e FAQ finais.
- [ ] Cupom/preço de lançamento.

## Fase 4 — QA e lançamento (08–10/09)
- [x] Hospedagem HTTPS de produção via GitHub Pages.
- [ ] Teste Android/Chrome.
- [ ] Teste desktop.
- [ ] Teste instalação PWA/offline.
- [ ] Teste import/export.
- [ ] Corrigir bloqueadores.
- [ ] Publicar produto.
- [ ] Fazer primeira rodada de divulgação.

## Produção

URL atual: https://jhony4lves.github.io/Quinzena/

O deploy é feito automaticamente pela workflow `.github/workflows/pages.yml` após alterações na `main`.

## Corte de escopo

Até o lançamento ficam fora: Open Finance, login, IA, sincronização cloud, integração bancária, cartões complexos, investimentos e multiusuário.
