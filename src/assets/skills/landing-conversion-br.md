---
name: landing-conversion-br
description: Build a high-converting landing page tailored to the Brazilian market. Use this skill when the user asks for a "landing page", "LP", "página de venda", "página de captura", "vendas", or wants to drive a specific action (signup, lead, purchase, demo booking). Generates conversion-optimised structure with proven sections (hero, problem, solution, social proof, pricing, FAQ, CTA), Brazilian copywriting conventions (R$, CPF/CNPJ, parcelamento), and ships production-ready code.
---

# Landing page de conversão — mercado brasileiro

Esta skill constrói landing pages que **convertem visitantes em leads ou clientes**, otimizadas para o mercado brasileiro. Sempre que o usuário pedir uma LP, página de captura, página de vendas ou qualquer página com uma ação principal, siga este guia.

## 1. Descoberta antes de codar

Antes de escrever uma linha de código, descubra:

- **Qual é o produto?** Em uma frase. Sem jargão.
- **Quem é o público?** Persona, dor principal, nível de consciência (Schwartz: completamente inconsciente → mais consciente).
- **Qual é a ação única?** Comprar, agendar reunião, baixar lead magnet, assinar trial. Uma só.
- **Qual é a objeção #1?** Preço? Confiança? Resultado? Complexidade?
- **Há prova social disponível?** Logos, depoimentos com nome+foto, métricas, cases.

Se faltar algo crítico, **pergunte ao usuário** em vez de inventar.

## 2. Estrutura comprovada (ordem importa)

```
1. Hero
   - Headline focado em transformação (não em feature)
   - Subheadline reforça e quebra a objeção principal
   - CTA primário (verbo de ação, sem fricção)
   - Visual: produto em uso, não stock photo genérica

2. Prova social imediata
   - Faixa de logos OU contador de clientes/transações

3. Problema (espelho)
   - "Você já passou por isso?" — descrever a dor exatamente como o cliente fala
   - Use a linguagem da persona, não a sua

4. Solução
   - Como o produto resolve, em 3-5 features-benefício
   - Cada feature → benefício concreto (não "rápido", mas "publica em 3 minutos")

5. Como funciona
   - 3 passos visuais (numerados, ilustrados)

6. Prova social profunda
   - 2-3 depoimentos com nome + foto + cargo + métrica de resultado
   - Cases com número (não "ajudou muito", mas "+47% conversão em 60 dias")

7. Quebra de objeção (FAQ ou seção dedicada)
   - Garantia, política de cancelamento, segurança de pagamento, suporte BR

8. Preço (se aplicável)
   - 2-3 planos, plano do meio destacado
   - Sempre mostrar opção parcelada em BRL: "R$ 297 ou 12x R$ 29,70"
   - Selo de garantia próximo ao botão

9. CTA final
   - Repete a promessa do hero
   - Botão grande, com micro-copy de segurança ("sem cartão de crédito", "cancele quando quiser")

10. Footer
    - CNPJ, endereço, política de privacidade (LGPD), termos, suporte (e-mail + WhatsApp)
```

## 3. Padrões brasileiros obrigatórios

- **Preços em BRL** com vírgula decimal: `R$ 1.299,90` (não `R$ 1,299.90`)
- **Parcelamento sempre visível** quando aplicável: "ou 10x de R$ 129,99 sem juros"
- **CPF/CNPJ** validados no front (use libs como `cpf-cnpj-validator`)
- **WhatsApp** como canal de suporte (link `wa.me/55119...` com `?text=` pré-preenchido)
- **Selos de segurança**: SSL, Stripe/Pagar.me/Mercado Pago, "Compra 100% segura"
- **LGPD**: checkbox obrigatório no formulário de captura, link para política, base legal explícita

## 4. Copywriting que converte

- **Headline**: foco em **transformação** (estado depois), não no produto. ❌ "Plataforma de gestão financeira" ✅ "Pare de perder dinheiro em planilhas — controle seu fluxo de caixa em 5 minutos por dia"
- **Verbos no imperativo** no CTA: "Começar grátis", "Quero acesso", "Agendar demo" — nunca "Saiba mais"
- **Microcopy** abaixo do botão: remove a fricção ("sem cartão", "30 dias grátis", "5 min para configurar")
- **Tom**: você (não vocês). Direto. Sem corporativês.
- **Números específicos** > números redondos: "417 empresas" > "+400 empresas"

## 5. Stack técnica recomendada

- **Framework**: Next.js (App Router) ou Astro (LP estática pura, melhor performance)
- **Styling**: Tailwind v4 + variáveis CSS pra temas
- **Animações**: Framer Motion / Motion para entrada hero; CSS para hover/micro
- **Imagens**: `<Image>` do Next ou `<picture>` com AVIF + WebP fallback
- **Analytics**: GA4 + Meta Pixel + (se for performance) Hotjar/Microsoft Clarity
- **Performance**: LCP < 2s, CLS < 0.1, JS inicial < 150kb gzipped
- **Forms**: react-hook-form + zod. Submissão para Supabase / n8n webhook / API própria

## 6. Checklist antes de entregar

- [ ] Hero passa o teste dos 5 segundos (qualquer pessoa entende a oferta?)
- [ ] CTA aparece em ≥ 3 pontos da página
- [ ] Mobile: todos os CTAs no fold (sem scroll horizontal, fonte ≥ 16px)
- [ ] Lighthouse ≥ 90 em Performance e Accessibility
- [ ] Formulário envia dados pra um destino real (não console.log)
- [ ] LGPD: checkbox + link política + base legal
- [ ] Tracking: GA4 evento `generate_lead` no submit, `purchase` no checkout
- [ ] Favicon, OG image (1200x630), título e meta description otimizados

## 7. O que NUNCA fazer

- Headline genérico tipo "Bem-vindo à [empresa]" ou "Soluções em [setor]"
- Stock photo com pessoa rindo do nada
- "Saiba mais" como CTA principal
- Carrossel automático no hero (mata conversão)
- Formulário com mais de 4 campos na captura inicial
- Botão "Enviar" (use o verbo da ação: "Quero meu desconto")
- Pop-up de exit-intent agressivo na primeira visita
