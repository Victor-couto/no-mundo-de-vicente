document.addEventListener('DOMContentLoaded', () => {
  const fba = window.firebaseApp;
  
  if (!fba || !fba.auth) {
    alert("Erro na configuração do Firebase. Configure o apiKey no HTML.");
    document.getElementById('app-loading').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
    return;
  }

  const loginSection = document.getElementById('login-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const appLoading = document.getElementById('app-loading');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const ordersTbody = document.getElementById('orders-tbody');
  const refreshBtn = document.getElementById('refresh-btn');
  const logoutBtn = document.getElementById('logout-btn');

  // Estado global de auth
  let currentUserToken = null;

  // Monitorar estado de autenticação
  fba.onAuthStateChanged(fba.auth, async (user) => {
    appLoading.classList.add('hidden');
    if (user) {
      loginSection.classList.add('hidden');
      dashboardSection.classList.remove('hidden');
      currentUserToken = await user.getIdToken();
      loadOrders();
    } else {
      loginSection.classList.remove('hidden');
      dashboardSection.classList.add('hidden');
      currentUserToken = null;
    }
  });

  // Handle Login
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    loginError.classList.add('hidden');
    
    const btn = document.getElementById('login-btn');
    btn.textContent = 'Autenticando...';
    btn.disabled = true;

    fba.signInWithEmailAndPassword(fba.auth, email, password)
      .then(() => {
        btn.textContent = 'Autenticar';
        btn.disabled = false;
      })
      .catch((error) => {
        btn.textContent = 'Autenticar';
        btn.disabled = false;
        loginError.textContent = 'Erro: Usuário ou senha incorretos.';
        loginError.classList.remove('hidden');
        console.error(error);
      });
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    fba.signOut(fba.auth);
  });

  // Refresh
  refreshBtn.addEventListener('click', loadOrders);

  // Carregar pedidos
  async function loadOrders() {
    ordersTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando pedidos...</td></tr>';

    try {
      const q = fba.query(fba.collection(fba.db, "pedidos"), fba.orderBy("created_at", "desc"));
      const querySnapshot = await fba.getDocs(q);

      ordersTbody.innerHTML = '';

      if (querySnapshot.empty) {
        ordersTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum pedido encontrado.</td></tr>';
        return;
      }

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const tr = document.createElement('tr');

        const date = new Date(data.created_at).toLocaleDateString('pt-BR');
        const status = data.admin_status || 'Aguardando';
        const badgeClass = status.includes('Enviado') ? 'Enviado' : 'Aguardando';

        let itemsStr = '';
        let total = 0;
        if (data.items) {
          itemsStr = data.items.map(i => `${i.quantity}x ${i.name}`).join('<br>');
        }
        if (typeof data.total_amount === 'number') {
          total = (data.total_amount / 100).toFixed(2).replace('.', ',');
        } else if (data.charges && data.charges[0]) {
          total = (data.charges[0].amount.value / 100).toFixed(2).replace('.', ',');
        }

        const addr = data.shipping?.address;
        let addressStr = '<em style="color:#999;">Não informado</em>';
        if (addr) {
          addressStr = `${addr.street || ''}, ${addr.number || ''}${addr.complement ? ' - ' + addr.complement : ''}<br>${addr.locality || ''}, ${addr.city || ''} - ${addr.region_code || ''}<br>CEP: ${addr.postal_code || ''}`;
        }

        tr.innerHTML = `
          <td><strong>${doc.id}</strong></td>
          <td>${date}</td>
          <td>${data.customer?.name}<br><small>${data.customer?.email}</small></td>
          <td><small>${addressStr}</small></td>
          <td><small>${itemsStr}</small></td>
          <td>R$ ${total}</td>
          <td><span class="badge ${badgeClass}">${status}</span></td>
          <td>
            <button class="action-btn print-btn" data-id="${doc.id}">Imprimir Etiqueta</button>
            <button class="action-btn track-btn" data-id="${doc.id}">Inserir Rastreio</button>
          </td>
        `;
        
        // Attach doc data to the row for easy access
        tr.dataset.orderData = JSON.stringify(data);
        ordersTbody.appendChild(tr);
      });

      // Bind events
      document.querySelectorAll('.print-btn').forEach(btn => {
        btn.addEventListener('click', handlePrintLabel);
      });
      document.querySelectorAll('.track-btn').forEach(btn => {
        btn.addEventListener('click', handleTracking);
      });

    } catch (error) {
      console.error("Erro ao buscar pedidos:", error);
      ordersTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: red;">Erro ao carregar dados. Verifique a configuração do banco e permissões.</td></tr>';
    }
  }

  // Handle Tracking
  async function handleTracking(e) {
    const orderId = e.target.getAttribute('data-id');
    const code = prompt(`Insira o código de rastreio para o pedido ${orderId}:`);
    
    if (!code || code.trim() === '') return;

    if (!confirm(`Confirmar envio do código ${code} para o cliente?`)) return;

    e.target.disabled = true;
    e.target.textContent = 'Enviando...';

    try {
      // Chama a API que fizemos na Vercel
      const response = await fetch('https://no-mundo-de-vicente.vercel.app/api/admin/send-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUserToken}`
        },
        body: JSON.stringify({ orderId, trackingCode: code })
      });

      const resData = await response.json();
      
      if (response.ok) {
        alert('Rastreio salvo e e-mail enviado ao cliente com sucesso!');
        loadOrders();
      } else {
        alert('Erro: ' + (resData.error || 'Falha ao enviar rastreio.'));
        e.target.disabled = false;
        e.target.textContent = 'Inserir Rastreio';
      }
    } catch (error) {
      console.error(error);
      alert('Erro de rede ao conectar com a API.');
      e.target.disabled = false;
      e.target.textContent = 'Inserir Rastreio';
    }
  }

  // Handle Print Label
  function handlePrintLabel(e) {
    const tr = e.target.closest('tr');
    const rawData = tr.dataset.orderData;
    if(!rawData) return;
    
    const data = JSON.parse(rawData);
    const addr = data.shipping?.address || {};
    
    const labelHtml = `
      <div class="label-title">ETIQUETA DE ENVIO</div>
      
      <div class="label-section">
        <strong>REMETENTE:</strong>
        <div class="label-text">
          Loja No Mundo de Vicente<br>
          Rua Fictícia, 123 - Centro<br>
          São Paulo - SP<br>
          CEP: 01000-000
        </div>
      </div>
      
      <hr style="border:1px dashed #ccc; margin: 10mm 0;">

      <div class="label-section">
        <strong>DESTINATÁRIO:</strong>
        <div class="label-text" style="font-size: 13pt;">
          <b>${data.customer?.name}</b><br>
          ${addr.street}, ${addr.number} ${addr.complement ? '- ' + addr.complement : ''}<br>
          ${addr.locality}, ${addr.city} - ${addr.region_code}<br>
          <b>CEP: ${addr.postal_code}</b>
        </div>
      </div>
    `;

    const printSection = document.getElementById('label-content');
    printSection.innerHTML = labelHtml;
    
    window.print();
  }

});
