const API_BASE = "https://task-manager-14nj.onrender.com/api";
let currentWorkspaceId = null;
let currentUserRole = null;
let allWorkspaces = [];

const token = localStorage.getItem("access");
if (!token) window.location.href = "login.html";

// Lấy username từ token (giả lập) hoặc gọi API user info nếu cần
// Ở đây ta tạm thời chưa hiển thị username, tập trung vào logic chính

const authHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`,
};

// ======== WORKSPACE LOGIC ======== //

async function loadWorkspaces() {
  const res = await fetch(`${API_BASE}/workspaces/`, { headers: authHeaders });
  if (!res.ok) { if (res.status === 401) logout(); return; }

  allWorkspaces = await res.json();
  const select = document.getElementById("workspace-select");
  select.innerHTML = ""; 

  if (allWorkspaces.length > 0) {
      // Có Workspace: Ẩn nút tạo dự phòng, hiện Dropdown
      document.getElementById("empty-state-create-btn").style.display = "none";
      document.getElementById("workspace-select").style.display = "inline-block";
      document.getElementById("member-section").style.display = "block";

      allWorkspaces.forEach(ws => {
        const opt = document.createElement("option");
        opt.value = ws.id;
        opt.textContent = ws.name;
        select.appendChild(opt);
      });

      // Chọn workspace hiện tại hoặc cái đầu tiên
      const exists = allWorkspaces.find(w => w.id == currentWorkspaceId);
      if(!currentWorkspaceId || !exists) {
          currentWorkspaceId = allWorkspaces[0].id;
      }
      select.value = currentWorkspaceId;
      
      // CẬP NHẬT GIAO DIỆN THEO QUYỀN
      updateWorkspaceUI(currentWorkspaceId);
  } 
  else {
      // Không có Workspace: Ẩn Dropdown, Hiện nút tạo dự phòng
      document.getElementById("workspace-select").style.display = "none";
      document.getElementById("admin-workspace-controls").style.display = "none";
      document.getElementById("member-section").style.display = "none";
      document.getElementById("boards-container").innerHTML = "<p style='text-align:center; margin-top:20px;'>Bạn chưa có Workspace nào.</p>";
      document.getElementById("empty-state-create-btn").style.display = "inline-block";
  }
}

function updateWorkspaceUI(wsId) {
    const ws = allWorkspaces.find(w => w.id == wsId);
    if(!ws) return;

    currentWorkspaceId = wsId;
    currentUserRole = ws.user_role; 

    console.log(`Workspace: ${ws.name} | Role: ${currentUserRole}`);

    // Khu vực cần ẩn/hiện
    const adminControls = document.getElementById("admin-workspace-controls");
    const adminInvite = document.getElementById("admin-invite-area");

    if (currentUserRole === 'admin') {
        // ADMIN: Hiện các nút thêm/xóa/mời
        if(adminControls) adminControls.style.display = "flex";
        if(adminInvite) adminInvite.style.display = "flex";
    } else {
        // MEMBER: Ẩn các nút quản trị (Dropdown vẫn còn vì nằm ngoài)
        if(adminControls) adminControls.style.display = "none";
        if(adminInvite) adminInvite.style.display = "none";
    }

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
    if(currentUserRole !== 'admin') return alert("Bạn không có quyền xóa Workspace này!");
    if(confirm("Chuyển Workspace này vào thùng rác?")) {
        await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/`, { method: "DELETE", headers: authHeaders });
        currentWorkspaceId = null;
        loadWorkspaces();
    }
}

// ======== MEMBER LOGIC ======== //

async function loadMembers(wsId) {
    const res = await fetch(`${API_BASE}/workspaces/${wsId}/members/`, { headers: authHeaders });
    const members = await res.json();
    document.getElementById("member-list").innerHTML = members.map(m => {
        // Nút xóa thành viên chỉ hiện nếu mình là Admin
        const deleteBtn = (currentUserRole === 'admin' && m.role !== 'admin') 
            ? `<span style="cursor:pointer;color:red;margin-left:8px;" onclick="removeMember(${m.user})">&times;</span>` : "";
        return `<span class="badge">${m.username} (${m.role})${deleteBtn}</span>`;
    }).join(" ");
}

async function addMember() {
    if(currentUserRole !== 'admin') return alert("Không có quyền!");
    const email = document.getElementById("new-member-email").value.trim();
    if (!email) return alert("Nhập email!");
    const res = await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/add_member/`, { method: "POST", headers: authHeaders, body: JSON.stringify({ email }) });
    if(res.ok) { alert("Đã thêm!"); document.getElementById("new-member-email").value=""; loadMembers(currentWorkspaceId); }
    else { const e = await res.json(); alert(e.error || "Lỗi"); }
}

async function removeMember(uid) {
    if(!confirm("Xóa thành viên?")) return;
    await fetch(`${API_BASE}/workspaces/${currentWorkspaceId}/remove_member/`, { method: "POST", headers: authHeaders, body: JSON.stringify({ user_id: uid }) });
    loadMembers(currentWorkspaceId);
}

// ======== BOARD & LIST & CARD LOGIC ======== //

async function loadBoards() {
  const res = await fetch(`${API_BASE}/boards/`, { headers: authHeaders });
  const boards = await res.json();
  const container = document.getElementById("boards-container");
  container.innerHTML = "";
  
  const filtered = boards.filter(b => b.workspace == currentWorkspaceId);
  if(filtered.length === 0) container.innerHTML = "<p style='text-align:center; width:100%; color:#666'>Chưa có board nào.</p>";

  filtered.forEach(board => {
    const div = document.createElement("div");
    div.className = "board";
    // Nút xóa board: Tùy ý, ở đây tôi để Admin mới được xóa cho an toàn
    const delBtn = (currentUserRole === 'admin') ? `<button onclick="deleteBoard(${board.id})" class="btn-danger btn-sm">&times;</button>` : "";
    
    div.innerHTML = `
        <div style="display:flex;justify-content:space-between; margin-bottom:10px;">
            <h3 style="margin:0">${board.name}</h3>${delBtn}
        </div>
        <div class="lists" id="lists-${board.id}"></div>
        <button onclick="addList(${board.id})" class="btn-primary full-width" style="margin-top:10px">➕ Thêm List</button>
    `;
    container.appendChild(div);
    loadLists(board.id);
  });
}

async function deleteBoard(id) {
    if(!confirm("Xóa Board?")) return;
    await fetch(`${API_BASE}/boards/${id}/`, { method: "DELETE", headers: authHeaders });
    loadBoards();
}

document.getElementById("add-board-btn").addEventListener("click", async () => {
    const name = document.getElementById("new-board-name").value;
    if(name) {
        await fetch(`${API_BASE}/boards/`, { method: "POST", headers: authHeaders, body: JSON.stringify({name, workspace: currentWorkspaceId}) });
        document.getElementById("new-board-name").value="";
        loadBoards();
    }
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
          <div id="cards-${list.id}" class="card-container" style="min-height:50px"></div>
          <input type="text" id="new-card-${list.id}" placeholder="Thêm thẻ..." onkeypress="if(event.key==='Enter') addCard(${list.id})" style="width:100%; margin-top:5px">
        `;
        container.appendChild(div);
        loadCards(list.id);

        setTimeout(() => {
            new Sortable(document.getElementById(`cards-${list.id}`), {
                group: 'shared', animation: 150,
                onAdd: function(evt) {
                    fetch(`${API_BASE}/cards/${evt.item.dataset.id}/`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ list: list.id }) });
                }
            });
        }, 500);
    });
}

async function addList(boardId) {
    const title = prompt("Tên List:");
    if(title) { await fetch(`${API_BASE}/lists/`, { method: "POST", headers: authHeaders, body: JSON.stringify({board: boardId, title}) }); loadLists(boardId); }
}

async function loadCards(listId) {
    const dateFilter = document.getElementById("filter-date").value;
    let url = `${API_BASE}/cards/`;
    if(dateFilter) url += `?date=${dateFilter}`;

    const res = await fetch(url, { headers: authHeaders });
    const cards = await res.json();
    const container = document.getElementById(`cards-${listId}`);
    if(!container) return;
    container.innerHTML = "";

    cards.filter(c => c.list === listId).forEach(card => {
        const div = document.createElement("div");
        div.className = "card";
        div.setAttribute("data-id", card.id);
        if(card.status==='DONE') div.classList.add("card-done");
        if(card.status==='CANCELLED') div.classList.add("card-cancelled");
        
        let icon = "";
        if(card.status==='DONE') icon="✅"; else if(card.status==='CANCELLED') icon="❌";

        div.innerHTML = `<strong>${icon} ${card.title}</strong>${card.due_date ? `<br><small>📅 ${card.due_date}</small>`:''}`;
        div.onclick = () => openCardDetail(card.id);
        container.appendChild(div);
    });
}

async function addCard(listId) {
    const input = document.getElementById(`new-card-${listId}`);
    if(!input.value) return;
    await fetch(`${API_BASE}/cards/`, { method: "POST", headers: authHeaders, body: JSON.stringify({list: listId, title: input.value}) });
    input.value="";
    loadCards(listId);
}

// ======== MODALS & TRASH ======== //

async function openCardDetail(id) {
    const res = await fetch(`${API_BASE}/cards/${id}/`, { headers: authHeaders });
    const c = await res.json();
    document.getElementById("card-title").textContent = c.title;
    document.getElementById("card-description").value = c.description || "";
    document.getElementById("card-due-date").value = c.due_date || "";
    document.getElementById("card-status").value = c.status;
    document.getElementById("card-labels").value = c.labels || "";
    
    document.getElementById("save-card").onclick = async () => {
        const payload = {
            description: document.getElementById("card-description").value,
            due_date: document.getElementById("card-due-date").value || null,
            status: document.getElementById("card-status").value,
            labels: document.getElementById("card-labels").value
        };
        if(payload.status === 'DONE') {
             await fetch(`${API_BASE}/cards/${id}/archive/`, { method: "POST", headers: authHeaders });
        } else {
             await fetch(`${API_BASE}/cards/${id}/`, { method: "PATCH", headers: authHeaders, body: JSON.stringify(payload) });
        }
        document.getElementById("card-detail").style.display="none";
        loadBoards();
    };

    document.getElementById("delete-card-btn").onclick = async () => {
        if(confirm("Xóa mềm thẻ này?")) {
            await fetch(`${API_BASE}/cards/${id}/soft_delete/`, { method: "POST", headers: authHeaders });
            document.getElementById("card-detail").style.display="none";
            loadBoards();
        }
    };
    document.getElementById("card-detail").style.display = "block";
}

async function openWorkspaceTrash() {
    const res = await fetch(`${API_BASE}/workspaces/trash/`, { headers: authHeaders });
    const d = await res.json();
    const l = document.getElementById("ws-trash-list"); l.innerHTML = d.length ? "" : "Trống";
    d.forEach(w => l.innerHTML += `<div style="display:flex;justify-content:space-between;margin:5px 0;padding:5px;background:#eee"><b>${w.name}</b> <button onclick="restoreWorkspace(${w.id})">♻️</button></div>`);
    document.getElementById("ws-trash-modal").style.display = "block";
}
async function restoreWorkspace(id) {
    await fetch(`${API_BASE}/workspaces/${id}/restore/`, { method: "POST", headers: authHeaders });
    openWorkspaceTrash(); loadWorkspaces();
}

async function openTrashModal() {
    const res = await fetch(`${API_BASE}/cards/trash/`, { headers: authHeaders });
    const d = await res.json();
    const l = document.getElementById("trash-list"); l.innerHTML = d.length ? "" : "Trống";
    d.forEach(c => l.innerHTML += `<div style="display:flex;justify-content:space-between;margin:5px 0;padding:5px;background:#eee"><b>${c.title}</b> <button onclick="restoreCard(${c.id})">♻️</button></div>`);
    document.getElementById("trash-modal").style.display = "block";
}
async function restoreCard(id) {
    await fetch(`${API_BASE}/cards/${id}/restore/`, { method: "POST", headers: authHeaders });
    openTrashModal(); loadBoards();
}

async function openArchiveModal() {
    const res = await fetch(`${API_BASE}/cards/archived/`, { headers: authHeaders });
    const d = await res.json();
    const l = document.getElementById("archive-list"); l.innerHTML = d.length ? "" : "Trống";
    d.forEach(c => l.innerHTML += `<div class="card card-done"><b>${c.title}</b></div>`);
    document.getElementById("archive-modal").style.display = "block";
}

function closeModal(id) { document.getElementById(id).style.display = "none"; }
function logout() { localStorage.removeItem("access"); window.location.href = "login.html"; }

// --- ĐÃ KHÔI PHỤC SỰ KIỆN NÚT THEME ---
document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

window.addEventListener("DOMContentLoaded", loadWorkspaces);