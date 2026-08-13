// ── LÓGICA DO CARRINHO DE COMPRAS ──

// Estrutura de dados inicial do Carrinho
let carrinho = [];

// Carrega o carrinho do localStorage ao iniciar
document.addEventListener('DOMContentLoaded', () => {
  carregarCarrinho();
  inicializarEventosCarrinho();
});

// Carrega o carrinho do localStorage
function carregarCarrinho() {
  const carrinhoSalvo = localStorage.getItem('nomundodevicente_cart');
  if (carrinhoSalvo) {
    try {
      carrinho = JSON.parse(carrinhoSalvo);
    } catch (e) {
      carrinho = [];
    }
  }
  atualizarContadores();
}

// Salva o carrinho no localStorage
function salvarCarrinho() {
  localStorage.setItem('nomundodevicente_cart', JSON.stringify(carrinho));
  atualizarContadores();
  renderizarCarrinho();
}

// Inicializa eventos e listeners para botões
function inicializarEventosCarrinho() {
  // Listener para fechar o carrinho
  const fecharBtn = document.querySelector('.carrinho-fechar');
  if (fecharBtn) {
    fecharBtn.addEventListener('click', fecharCarrinho);
  }

  // Fechar clicando no overlay de fundo
  const overlay = document.querySelector('.carrinho-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        fecharCarrinho();
      }
    });
  }

  // Tecla Escape fecha o carrinho
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fecharCarrinho();
    }
  });
}

// Abre o carrinho
function abrirCarrinho() {
  const overlay = document.querySelector('.carrinho-overlay');
  if (overlay) {
    overlay.classList.add('ativo');
    document.body.style.overflow = 'hidden'; // Impede scroll de fundo
    renderizarCarrinho();
  }
}

// Fecha o carrinho
function fecharCarrinho() {
  const overlay = document.querySelector('.carrinho-overlay');
  if (overlay) {
    overlay.classList.remove('ativo');
    document.body.style.overflow = ''; // Libera scroll
  }
}

// Adiciona um item ao carrinho
function adicionarAoCarrinho(id, titulo, preco, img) {
  // Procura se o item já existe no carrinho
  const itemExistente = carrinho.find(item => item.id === id);

  if (itemExistente) {
    itemExistente.qtd += 1;
  } else {
    carrinho.push({
      id: id,
      titulo: titulo,
      preco: parseFloat(preco),
      img: img,
      qtd: 1
    });
  }

  salvarCarrinho();
  abrirCarrinho();
}

// Altera a quantidade de um item
function alterarQuantidade(id, delta) {
  const item = carrinho.find(item => item.id === id);
  if (item) {
    item.qtd += delta;
    if (item.qtd <= 0) {
      carrinho = carrinho.filter(item => item.id !== id);
    }
    salvarCarrinho();
  }
}

// Remove um item do carrinho
function removerDoCarrinho(id) {
  carrinho = carrinho.filter(item => item.id !== id);
  salvarCarrinho();
}

// Calcula o total do carrinho
function calcularTotal() {
  return carrinho.reduce((total, item) => total + (item.preco * item.qtd), 0);
}

// Calcula a quantidade total de itens no carrinho
function calcularQuantidadeTotal() {
  return carrinho.reduce((total, item) => total + item.qtd, 0);
}

// Atualiza os contadores numéricos na navbar
function atualizarContadores() {
  const contadores = document.querySelectorAll('.carrinho-badge');
  const totalItens = calcularQuantidadeTotal();

  contadores.forEach(badge => {
    if (totalItens > 0) {
      badge.textContent = totalItens;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  });
}

// Renderiza a lista de itens e total na gaveta
function renderizarCarrinho() {
  const listaContainer = document.getElementById('carrinho-itens-lista');
  const subtotalVal = document.getElementById('carrinho-total-val');
  
  if (!listaContainer) return;

  // Limpa container
  listaContainer.innerHTML = '';

  if (carrinho.length === 0) {
    listaContainer.innerHTML = `
      <div class="carrinho-vazio">
        <span class="carrinho-vazio-icon">🛒</span>
        <p>Seu carrinho está vazio.</p>
        <p style="font-size: 0.85rem;">Que tal adicionar o livro "Entendendo Como Sou"?</p>
      </div>
    `;
    if (subtotalVal) subtotalVal.textContent = '0,00';
    return;
  }

  // Adiciona itens à lista
  carrinho.forEach(item => {
    const itemElement = document.createElement('div');
    itemElement.className = 'carrinho-item';
    itemElement.innerHTML = `
      <img src="${item.img}" alt="Capa do livro ${item.titulo}" class="carrinho-item-img" width="64" height="85">
      <div class="carrinho-item-info">
        <h4 class="carrinho-item-titulo">${item.titulo}</h4>
        <div class="carrinho-item-preco">R$ ${item.preco.toFixed(2).replace('.', ',')}</div>
        <div class="carrinho-item-acoes">
          <div class="qtd-seletor">
            <button class="qtd-btn" onclick="alterarQuantidade('${item.id}', -1)" aria-label="Diminuir quantidade">-</button>
            <span class="qtd-num">${item.qtd}</span>
            <button class="qtd-btn" onclick="alterarQuantidade('${item.id}', 1)" aria-label="Aumentar quantidade">+</button>
          </div>
          <button class="btn-remover-item" onclick="removerDoCarrinho('${item.id}')" aria-label="Remover do carrinho">
            🗑️ Remover
          </button>
        </div>
      </div>
    `;
    listaContainer.appendChild(itemElement);
  });

  // Atualiza subtotal
  if (subtotalVal) {
    subtotalVal.textContent = calcularTotal().toFixed(2).replace('.', ',');
  }
}

// Link oficial do anúncio do livro "Entendendo Como Sou" no Mercado Livre
const LINK_MERCADO_LIVRE = 'https://www.mercadolivre.com.br/entendendo-como-sou-um-livro-sensivel-e-educativo-sobre-emocoes-autoconhecimento-e-respeito-as-diferencas-ajuda-criancas-a-entenderem-seus-sentimentos-e-jeitinhos-unicos/up/MLBU3507661368';

// Finaliza a compra abrindo o anúncio do Mercado Livre em uma nova aba
function finalizarCompraCarrinho() {
  if (carrinho.length === 0) {
    alert('Adicione itens ao carrinho antes de finalizar a compra!');
    return;
  }

  // Redireciona o usuário para o Mercado Livre em uma nova aba
  window.open(LINK_MERCADO_LIVRE, '_blank');
}

// Executa na inicialização: Se na URL vier '?checkout=true', abre o carrinho automaticamente
if (window.location.search.includes('checkout=true')) {
  window.addEventListener('load', () => {
    // Limpa a query string para não repetir a ação em futuros reloads
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(abrirCarrinho, 500);
  });
}
