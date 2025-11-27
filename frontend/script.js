const API_BASE = "http://127.0.0.1:8000/api";
let currentWorkspaceId = null;
let currentUserRole = null;
let allWorkspaces = [];

const token = localStorage.getItem("access");
if (!token) window.location.href = "login.html";

const authHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`,
};

// ======== 1. WORKSPACE ======== //

async function loadWorkspaces() {
  const res = await fetch(`${API_BASE}/workspaces/`, { headers: authHeaders });
  if (!res.ok) { if (res.status === 401) logout(); return; }

  allWorkspaces = await res.json();
  const select = document.getElementById("workspace-select");
  select.innerHTML = "";

  if (allWorkspaces.length > 0) {
      document.getElementById("empty-state-create-btn").style.display = "none";
      document.getElementById("workspace-select").style.display = "inline-block";
      document.getElementById("member-section").style.display = "block";

      allWorkspaces.forEach(ws => {
        const opt = document.createElement("option");
        opt.value = ws.id;
        opt.textContent = ws.name;
        select.appendChild(opt);
      });

      const exists = allWorkspaces.find(w => w.id == currentWorkspaceId);
      if(!currentWorkspaceId || !exists) {
          currentWorkspaceId = allWorkspaces[0].id;
      }
      select.value = currentWorkspaceId;
      updateWorkspaceUI(currentWorkspaceId);
  } else {
      document.getElementById("workspace-select").style.display = "none";
      document.getElementById("admin-workspace-controls").style.display = "flex"; 
      document.getElementById("delete-workspace-btn").style.display = "none";
      document.getElementById("trash-workspace-btn").style.display = "none";
      document.getElementById("member-section").style.display = "none";
      document.getElementById("boards-container").innerHTML = "<p style='text-align:center;color:#666;margin-top:30px;'>Bạn chưa có Workspace nào.</p>";
      document.getElementById("empty-state-create-btn").style.display = "inline-block";
  }
}

function updateWorkspaceUI(wsId) {
    const ws = allWorkspaces.find(w => w.id == wsId);
    if(!ws) return;

    currentWorkspaceId = wsId;
    currentUserRole = ws.user_role; 

    console.log(`Workspace: ${ws.name} | Role: ${currentUserRole}`);

    const adminControls = document.getElementById("admin-workspace-controls");
    const adminInvite = document.getElementById("admin-invite-area");
    const deleteWsBtn = document.getElementById("delete-workspace-btn");
    const trashWsBtn = document.getElementById("trash-workspace-btn");

    if(adminControls) adminControls.style.display = "flex";

    const isSuperBoss = ['system_admin', 'owner'].includes(currentUserRole);
    if(deleteWsBtn) deleteWsBtn.style.display = isSuperBoss ? "inline-block" : "none";
    if(trashWsBtn) trashWsBtn.style.display = isSuperBoss ? "inline-block" : "none";

    const canManageMember = ['system_admin', 'owner', 'admin'].includes(currentUserRole);
    if(adminInvite) adminInvite.style.display = canManageMember ? "flex" : "none";

    loadBoards();
    loadMembers(wsId);
}

document.getElementById("workspace-select").addEventListener("change", function() {
    updateWorkspaceUI(this.value);
});

async function addWorkspace() {
    let name = document.getElementById("new-workspace-name").value.trim();
    if (!name) name = prompt("Nhập tên Workspace mới:");
    if (!name) return;
    await fetch(`${API_BASE}/workspaces/`, { method: "POST", headers: authHeaders, body: JSON.stringify({ name }) });
    document.getElementById("new-workspace-name").value = "";
    loadWorkspaces();
}
function addWorkspacePrompt() { addWorkspace(); }

async function deleteWorkspace() {
    if(!['system_admin', 'owner'].includes(currentUserRole)) return alert("Chỉ chủ sở hữu mới được xóa!");
    if(confirm("Xóa Workspace này vào thùng rác?")) {
        await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/`, { method: "DELETE", headers: authHeaders });
        currentWorkspaceId = null;
        loadWorkspaces();
    }
}

// ======== 2. MEMBERS ======== //

async function loadMembers(wsId) {
    const res = await fetch(`${API_BASE}/workspaces/${wsId}/members/`, { headers: authHeaders });
    const members = await res.json();
    const container = document.getElementById("member-list");
    
    const canEditRole = ['system_admin', 'owner'].includes(currentUserRole);
    const canDeleteMember = ['system_admin', 'owner', 'admin'].includes(currentUserRole);

    container.innerHTML = members.map(m => {
        let deleteBtn = "";
        if (canDeleteMember && m.role !== 'owner') {
             deleteBtn = `<span style="cursor:pointer;color:red;margin-left:10px;font-weight:bold;font-size:18px;" onclick="removeMember(${m.user})" title="Xóa">&times;</span>`;
        }

        let roleDisplay = "";
        if (canEditRole && m.role !== 'owner') {
            roleDisplay = `
                <select onchange="updateMemberRole(${m.user}, this.value)" style="font-size:12px;padding:2px;border-radius:4px;border:1px solid #ccc;">
                    <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
                    <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            `;
        } else {
            let color = m.role === 'owner' ? '#fff3cd' : (m.role === 'admin' ? '#e3f2fd' : '#f5f5f5');
            let label = m.role === 'owner' ? '🔑 Owner' : (m.role === 'admin' ? '👑 Admin' : '👤 Member');
            roleDisplay = `<span style="background:${color};padding:2px 8px;border-radius:10px;font-size:12px;border:1px solid #ddd;">${label}</span>`;
        }

        return `
            <div style="display:inline-flex;align-items:center;margin:5px;padding:6px 12px;background:#fff;border:1px solid #eee;border-radius:20px;box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                <span style="font-weight:600;margin-right:8px;color:#333;">${m.username}</span>
                ${roleDisplay}
                ${deleteBtn}
            </div>
        `;
    }).join(" ");
}

async function addMember() {
    const email = document.getElementById("new-member-email").value.trim();
    if (!email) return alert("Nhập email!");
    const res = await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/add_member/`, { method: "POST", headers: authHeaders, body: JSON.stringify({ email }) });
    if(res.ok) { alert("Đã thêm!"); document.getElementById("new-member-email").value=""; loadMembers(currentWorkspaceId); }
    else { const e = await res.json(); alert(e.error || "Lỗi"); }
}

async function removeMember(uid) {
    if(!confirm("Xóa thành viên này?")) return;
    await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/remove_member/`, { method: "POST", headers: authHeaders, body: JSON.stringify({ user_id: uid }) });
    loadMembers(currentWorkspaceId);
}

async function updateMemberRole(uid, newRole) {
    if(!confirm(`Đổi quyền thành viên này thành ${newRole}?`)) {
        loadMembers(currentWorkspaceId); return;
    }
    const res = await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/update_member_role/`, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ user_id: uid, role: newRole })
    });
    if(res.ok) { alert("Cập nhật thành công!"); loadWorkspaces(); } 
    else { const e = await res.json(); alert(e.error); loadMembers(currentWorkspaceId); }
}

// ======== 3. BOARD & CARD ======== //
async function loadBoards() {
  const res = await fetch(`${API_BASE}/boards/`, { headers: authHeaders });
  const boards = await res.json();
  const container = document.getElementById("boards-container");
  container.innerHTML = "";
  const filtered = boards.filter(b => b.workspace == currentWorkspaceId);
  
  if(filtered.length === 0) {
      container.innerHTML = "<p style='text-align:center;color:#888;width:100%;margin-top:20px;'>Chưa có Board nào. Hãy tạo mới!</p>";
      return;
  }

  filtered.forEach(board => {
    const div = document.createElement("div");
    div.className = "board";
    const canDel = ['system_admin', 'owner', 'admin'].includes(currentUserRole);
    const delBtn = canDel ? `<button onclick="deleteBoard(${board.id})" class="btn-icon" title="Xóa Board">&times;</button>` : "";
    
    div.innerHTML = `
        <div class="board-header"><span>${board.name}</span>${delBtn}</div>
        <div class="lists" id="lists-${board.id}"></div>
        <button onclick="addList(${board.id})" class="btn-primary" style="margin-top:auto;"><i class="fas fa-plus"></i> Thêm List</button>
    `;
    container.appendChild(div);
    loadLists(board.id);
  });
}

async function deleteBoard(id) { if(confirm("Xóa Board?")) { await fetch(`${API_BASE}/boards/${id}/`, { method: "DELETE", headers: authHeaders }); loadBoards(); } }
document.getElementById("add-board-btn").addEventListener("click", async () => {
    const name = document.getElementById("new-board-name").value;
    if(name) { await fetch(`${API_BASE}/boards/`, { method: "POST", headers: authHeaders, body: JSON.stringify({name, workspace: currentWorkspaceId}) }); document.getElementById("new-board-name").value=""; loadBoards(); }
});

async function loadLists(boardId) {
    const res = await fetch(`${API_BASE}/lists/`, { headers: authHeaders });
    const lists = await res.json();
    const container = document.getElementById(`lists-${boardId}`);
    lists.filter(l => l.board === boardId).forEach(list => {
        const div = document.createElement("div");
        div.className = "list";
        div.innerHTML = `
            <h3>${list.title}</h3>
            <div id="cards-${list.id}" class="card-container"></div>
            <input type="text" id="new-card-${list.id}" class="add-card-input" placeholder="+ Thêm thẻ..." onkeypress="if(event.key==='Enter') addCard(${list.id})">
        `;
        container.appendChild(div);
        loadCards(list.id);
        setTimeout(() => { new Sortable(document.getElementById(`cards-${list.id}`), { group: 'shared', animation: 150, onAdd: (evt) => { fetch(`${API_BASE}/cards/${evt.item.dataset.id}/`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ list: list.id }) }); } }); }, 500);
    });
}
async function addList(boardId) { const t = prompt("Tên List:"); if(t) { await fetch(`${API_BASE}/lists/`, { method: "POST", headers: authHeaders, body: JSON.stringify({board: boardId, title: t}) }); loadLists(boardId); } }
async function loadCards(listId) {
    const res = await fetch(`${API_BASE}/cards/`, { headers: authHeaders });
    const cards = await res.json();
    const container = document.getElementById(`cards-${listId}`);
    container.innerHTML = "";
    cards.filter(c => c.list === listId).forEach(c => {
        const div = document.createElement("div"); div.className = `card ${c.status==='DONE'?'card-done':''}`; div.setAttribute("data-id", c.id);
        div.innerHTML = `<strong>${c.title}</strong>`; div.onclick = () => openCardDetail(c.id);
        container.appendChild(div);
    });
}
async function addCard(listId) { const i = document.getElementById(`new-card-${listId}`); if(i.value) { await fetch(`${API_BASE}/cards/`, { method: "POST", headers: authHeaders, body: JSON.stringify({list: listId, title: i.value}) }); i.value=""; loadCards(listId); } }

// ======== 4. MODALS & TRASH & ARCHIVE (ĐÃ SỬA ĐÚNG) ======== //

async function openCardDetail(id) { 
    const res = await fetch(`${API_BASE}/cards/${id}/`, { headers: authHeaders }); const c = await res.json();
    document.getElementById("card-title").textContent = c.title; document.getElementById("card-description").value = c.description||""; 
    document.getElementById("card-detail").style.display="block";
    
    // Nút LƯU (Nếu chọn Done -> Vào Kho)
    document.getElementById("save-card").onclick = async () => { 
        const payload = { description: document.getElementById("card-description").value, status: document.getElementById("card-status").value };
        if (payload.status === 'DONE') {
             await fetch(`${API_BASE}/cards/${id}/archive/`, { method: "POST", headers: authHeaders });
             alert("Đã xong! Thẻ được chuyển vào Kho lưu trữ.");
        } else {
             await fetch(`${API_BASE}/cards/${id}/`, { method: "PATCH", headers: authHeaders, body: JSON.stringify(payload) });
        }
        document.getElementById("card-detail").style.display="none"; loadBoards(); 
    };

    // Nút XÓA (Vào Thùng rác - Lưu vĩnh viễn)
    document.getElementById("delete-card-btn").onclick = async () => { 
        if(confirm("Xóa thẻ vào thùng rác?")) { 
            await fetch(`${API_BASE}/cards/${id}/soft_delete/`, { method: "POST", headers: authHeaders }); 
            document.getElementById("card-detail").style.display="none"; 
            loadBoards(); 
        } 
    };
}

// Thùng rác Workspace
async function openWorkspaceTrash() { 
    const res = await fetch(`${API_BASE}/workspaces/trash/`, { headers: authHeaders }); 
    const d = await res.json(); 
    const l = document.getElementById("ws-trash-list"); 
    l.innerHTML = d.length ? "" : "<p style='text-align:center;color:#888'>Thùng rác trống.</p>"; 
    d.forEach(w => l.innerHTML+=`<div style="display:flex;justify-content:space-between;margin:5px 0;padding:5px;background:#eee"><b>${w.name}</b> <button onclick="restoreWs(${w.id})">♻️</button></div>`); 
    document.getElementById("ws-trash-modal").style.display="block"; 
}
async function restoreWs(id) { await fetch(`${API_BASE}/workspaces/${id}/restore/`, { method: "POST", headers: authHeaders }); openWorkspaceTrash(); loadWorkspaces(); }

// --- THÙNG RÁC THẺ (VĨNH VIỄN) ---
async function openTrashModal() { 
    const res = await fetch(`${API_BASE}/cards/trash/`, { headers: authHeaders }); 
    const d = await res.json(); 
    const l = document.getElementById("trash-list"); 
    
    const title = document.querySelector("#trash-modal h3");
    if(title) title.innerText = "🗑 Thùng rác Thẻ (Lưu vĩnh viễn)";

    l.innerHTML = d.length ? "" : "<p style='text-align:center;color:#888'>Thùng rác trống.</p>"; 
    d.forEach(c => l.innerHTML+=`
        <div style="display:flex;justify-content:space-between;margin:5px 0;padding:5px;background:#f8d7da;border-radius:5px;">
            <b>${c.title}</b> 
            <button class="btn-secondary btn-sm" onclick="restoreCard(${c.id})">♻️ Khôi phục</button>
        </div>`); 
    document.getElementById("trash-modal").style.display="block"; 
}
async function restoreCard(id) { await fetch(`${API_BASE}/cards/${id}/restore/`, { method: "POST", headers: authHeaders }); openTrashModal(); loadBoards(); }

// --- KHO LƯU TRỮ (XÓA SAU 7 NGÀY) ---
async function openArchiveModal() { 
    const res = await fetch(`${API_BASE}/cards/archived/`, { headers: authHeaders }); 
    const d = await res.json(); 
    const l = document.getElementById("archive-list"); 
    
    const title = document.querySelector("#archive-modal h3");
    if(title) title.innerText = "📦 Kho lưu trữ (Tự động xóa sau 7 ngày)";

    l.innerHTML = d.length ? "" : "<p style='text-align:center;color:#888'>Kho trống.</p>"; 
    d.forEach(c => {
        let statusColor = c.status==='CANCELLED' ? 'red' : 'green';
        let statusText = c.status==='CANCELLED' ? '[ĐÃ XÓA]' : '[ĐÃ XONG]';
        
        l.innerHTML+=`
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <div><span style="color:${statusColor};font-weight:bold;font-size:12px;">${statusText}</span> <b>${c.title}</b></div>
            <button class="btn-secondary btn-sm" onclick="restoreCardFromArchive(${c.id})">♻️ Lấy lại</button>
        </div>`;
    });
    document.getElementById("archive-modal").style.display="block"; 
}

async function restoreCardFromArchive(id) {
    await fetch(`${API_BASE}/cards/${id}/restore/`, { method: "POST", headers: authHeaders });
    openArchiveModal(); 
    loadBoards();
}

function closeModal(id) { document.getElementById(id).style.display = "none"; }
function logout() { localStorage.removeItem("access"); window.location.href = "login.html"; }

document.getElementById("theme-toggle").addEventListener("click", () => document.body.classList.toggle("dark"));
window.addEventListener("DOMContentLoaded", loadWorkspaces);