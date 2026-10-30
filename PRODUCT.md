# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois públicos com o mesmo peso (confirmado):

- **Famílias**, inclusive atípicas/neurodivergentes: adultos que decidem a compra e leem com a criança, procurando livros e atividades para conversar sobre sentimentos, diferenças e imaginação.
- **Escolas, educadores e profissionais** (psicopedagogos, terapeutas, instituições): usam os livros e recursos no trabalho com crianças e chegam também por parcerias e projetos.

As crianças usam o conteúdo (livros, jogos, imprimíveis), mas quem navega, compra e escreve é o adulto.

## Product Purpose

Site de literatura infantil e de recursos lúdicos do projeto "No Mundo de Vicente". Apresenta o projeto, vende os livros em loja própria, oferece atividades gratuitas para imprimir, publica entrevistas e abre espaço para parcerias. Sucesso: famílias e profissionais entendem o projeto, compram o livro com segurança e voltam pelos recursos.

## Positioning

O projeto nasceu dentro de casa, na família da autora, e Vicente é a inspiração do universo (confirmado). O nome foi escolhido pelo próprio Vicente. As histórias vêm de experiências reais de infância e de neurodiversidade vividas em família, o que outro projeto de literatura infantil não poderia dizer com verdade.

## Operating Context

- Loja própria: carrinho único no site, checkout via Mercado Pago Checkout Pro, frete fixo de R$ 7,49 por pedido, pedidos gravados no Firestore.
- Hospedagem na Vercel, domínio nomundodevicente.com.br. O deploy é manual (`vercel --prod`).
- Páginas estáticas na raiz, cada uma com CSS inline, mais `carrinho.css`/`carrinho.js` e `identidade.css` compartilhados.
- Painel administrativo em `admin.html` (envio de rastreio).

## Capabilities and Constraints

- Livros lançados: "Entendendo Como Sou" e "A Casa dos 3 Ventos" (ambos R$ 38,90). Em breve: "Vicente, os Bichinhos e o Poder da Imaginação" e "A Saudade do Papai".
- Recursos gratuitos para imprimir: Caça-Palavras das Emoções e Diário das Emoções. Em preparação: fichas de leitura, desenhos para colorir e novos jogos.
- Cada livro novo precisa ter o id cadastrado em `PRODUTOS_OFICIAIS` de `api/checkout.js`.
- Frete (`FRETE_PADRAO`) está duplicado em `checkout.html` e `api/checkout.js`.
- Sem cadastro de newsletter: o botão "Quero receber novidades" leva a `contato.html`.
- Em aberto: o link "Blog" aponta para `#blog`, que não existe. Decisão sobre ter ou não um blog ainda não tomada.

## Brand Commitments

- Nome: No Mundo de Vicente. Língua: português do Brasil.
- Personagem Vicente e as ilustrações do projeto são parte da identidade (existentes em `Imagens/`).
- **Sem promessas clínicas (confirmado):** o site não promete diagnóstico, tratamento nem resultado terapêutico. O tom é de acolhimento e de convite à conversa.
- Inferido do conteúdo existente, ainda não confirmado: tom caloroso, simples e sem jargão, em primeira pessoa do plural.

## Evidence on Hand

- Capas e mockup dos dois livros lançados, fotos de relatos em `Relatos/`, entrevista com Fernanda Tavares (`entrevista/`), PDFs/imagens dos jogos em `Imagens/JOGOS/`.
- Não há depoimentos formais de clientes, números de vendas, selos ou pesquisas. Não inventar.
- Preços e frete devem vir sempre do checkout real.

## Product Principles

1. Acolher antes de ensinar: falar com a família como quem divide uma história, não como especialista.
2. A imaginação da criança é o centro; o site abre conversas, não entrega respostas fechadas.
3. Confiança na compra: preço, frete e caminho até o pagamento sempre claros, sem surpresas.
4. Recursos gratuitos têm o mesmo cuidado que os livros pagos.
5. Nada de promessa clínica nem de prova inventada.

## Accessibility & Inclusion

Público inclui famílias neurodivergentes: preferir movimento calmo e opcional (respeitar `prefers-reduced-motion`), contraste alto, alvos de toque grandes e linguagem simples. Padrão mínimo adotado: WCAG AA.
