const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API = window.INSTA_SENAC_API_URL || (
  isLocalhost ? "http://localhost:3000/api" : `${window.location.origin}/api`
);
const tokenKey = "insta_senac_admin_token";
const loginSection = document.querySelector("#login");
const dashboard = document.querySelector("#dashboard");
const pageDetails = {
  overview: ["Visão geral", "Gerencie categorias e alunos em um só lugar."],
  categories: ["Categorias", "Organize os alunos por curso ou área."],
  "student-create": ["Cadastrar aluno", "Crie uma conta de aluno para acesso ao aplicativo."],
  students: ["Alunos", "Consulte e pesquise os alunos cadastrados."],
};
let token = sessionStorage.getItem(tokenKey);

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function showAlert(title, text, icon) {
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: "OK",
    confirmButtonColor: "#635bff",
  });
}

function setPage(page) {
  const selectedPage = pageDetails[page] ? page : "overview";
  const [title, description] = pageDetails[selectedPage];
  document.querySelector("#page-title").textContent = title;
  document.querySelector("#page-breadcrumb").textContent = title;
  document.querySelector("#page-description").textContent = description;
  document.querySelectorAll(".page-view").forEach((view) => {
    view.hidden = view.dataset.view !== selectedPage;
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    if (item.dataset.page === selectedPage) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
  if (location.hash !== `#${selectedPage}`) {
    location.hash = selectedPage;
  }
}

async function loadCategories() {
  const { categories } = await request("/admin/categories");
  const list = document.querySelector("#categories");
  const select = document.querySelector('[name="categoryId"]');
  list.replaceChildren();
  select.replaceChildren();
  document.querySelector("#category-count").textContent = String(categories.length);
  document.querySelector("#category-list-count").textContent = String(categories.length);
  for (const category of categories) {
    const item = document.createElement("li");
    item.className = "record-row";
    const name = document.createElement("span");
    name.className = "record-name";
    const marker = document.createElement("span");
    marker.className = "record-marker";
    marker.textContent = category.name.slice(0, 1).toUpperCase();
    const label = document.createElement("span");
    label.textContent = category.name;
    name.append(marker, label);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Excluir";
    remove.className = "button button-danger button-small";
    remove.addEventListener("click", async () => {
      const confirmation = await Swal.fire({
        title: "Excluir categoria?",
        text: `A categoria ${category.name} será desativada e não poderá ser selecionada em novos cadastros. Alunos já vinculados não serão alterados.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sim, excluir",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#bb3b4b",
        cancelButtonColor: "#687994",
        reverseButtons: true,
      });
      if (!confirmation.isConfirmed) return;

      try {
        await request(`/admin/categories/${category.id}`, { method: "DELETE" });
      } catch (error) {
        await showAlert("Não foi possível excluir a categoria", error.message, "error");
        return;
      }

      try {
        await loadCategories();
        await showAlert("Categoria excluída", `${category.name} foi desativada.`, "success");
      } catch (error) {
        await showAlert(
          "Categoria excluída",
          `A categoria foi desativada, mas não foi possível atualizar a lista: ${error.message}`,
          "warning",
        );
      }
    });
    item.append(name, remove);
    list.append(item);
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.append(option);
  }
  if (categories.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma categoria cadastrada.";
    list.append(empty);
  }
}

async function loadStudents(search = "") {
  const list = document.querySelector("#students");
  const query = new URLSearchParams({ search });
  const { students } = await request(`/admin/students?${query}`);
  list.replaceChildren();
  if (!search) document.querySelector("#student-count").textContent = String(students.length);
  if (students.length === 0) {
    const row = document.createElement("tr");
    const empty = document.createElement("td");
    empty.className = "empty-state";
    empty.colSpan = 4;
    empty.textContent = search ? "Nenhum aluno encontrado." : "Nenhum aluno cadastrado.";
    row.append(empty);
    list.append(row);
    return;
  }

  for (const student of students) {
    const row = document.createElement("tr");
    const studentCell = document.createElement("td");
    const identity = document.createElement("div");
    identity.className = "student-identity";
    const avatar = document.createElement("span");
    avatar.className = "student-avatar";
    avatar.textContent = student.name.slice(0, 1).toUpperCase();
    const details = document.createElement("span");
    details.className = "student-details";
    const name = document.createElement("strong");
    name.textContent = student.name;
    const email = document.createElement("small");
    email.textContent = student.email;
    details.append(name, email);
    identity.append(avatar, details);
    studentCell.append(identity);
    const enrollmentCell = document.createElement("td");
    enrollmentCell.textContent = student.enrollment_number;
    const categoryCell = document.createElement("td");
    const category = document.createElement("span");
    category.className = "category-tag";
    category.textContent = student.category_name;
    categoryCell.append(category);
    const actionsCell = document.createElement("td");
    actionsCell.className = "student-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-danger button-small";
    remove.textContent = "Excluir";
    remove.setAttribute("aria-label", `Excluir aluno ${student.name}`);
    remove.addEventListener("click", async () => {
      const confirmation = await Swal.fire({
        title: "Excluir aluno?",
        text: `A conta de ${student.name}, incluindo suas publicações, será excluída permanentemente.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sim, excluir",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#bb3b4b",
        cancelButtonColor: "#687994",
        reverseButtons: true,
      });
      if (!confirmation.isConfirmed) return;

      try {
        await request(`/admin/students/${student.id}`, { method: "DELETE" });
      } catch (error) {
        await showAlert("Não foi possível excluir o aluno", error.message, "error");
        return;
      }

      document.querySelector("#student-search-form").reset();
      try {
        await loadStudents("");
        await showAlert("Aluno excluído", `${student.name} foi removido do sistema.`, "success");
      } catch (error) {
        await showAlert(
          "Aluno excluído",
          `O aluno foi removido, mas não foi possível atualizar a lista: ${error.message}`,
          "warning",
        );
      }
    });
    actionsCell.append(remove);
    row.append(studentCell, enrollmentCell, categoryCell, actionsCell);
    list.append(row);
  }
}

async function enterDashboard() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  setPage(location.hash.slice(1));
  await Promise.all([loadCategories(), loadStudents()]);
}

document.querySelectorAll("[data-page]").forEach((item) => {
  item.addEventListener("click", () => {
    const page = item.dataset.page;
    if (page) setPage(page);
  });
});

window.addEventListener("hashchange", () => {
  if (token && dashboard.hidden === false) setPage(location.hash.slice(1));
});

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (result.role !== "admin") throw new Error("Este acesso não é de administrador.");
    token = result.token;
    sessionStorage.setItem(tokenKey, token);
    await enterDashboard();
  } catch (error) {
    sessionStorage.removeItem(tokenKey);
    token = null;
    dashboard.hidden = true;
    loginSection.hidden = false;
    await showAlert("Não foi possível entrar", error.message, "error");
  }
});

document.querySelector("#category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await request("/admin/categories", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
  } catch (error) {
    await showAlert("Não foi possível cadastrar a categoria", error.message, "error");
    return;
  }

  formElement.reset();
  try {
    await loadCategories();
  } catch (error) {
    await showAlert(
      "Categoria cadastrada",
      `A categoria foi cadastrada, mas não foi possível atualizar a lista: ${error.message}`,
      "warning",
    );
    return;
  }
  await showAlert("Categoria cadastrada", "A categoria já está disponível para novos alunos.", "success");
});

document.querySelector("#student-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await request("/admin/students", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
  } catch (error) {
    await showAlert("Não foi possível cadastrar o aluno", error.message, "error");
    return;
  }

  formElement.reset();
  document.querySelector("#student-search-form").reset();
  try {
    await loadStudents();
  } catch (error) {
    await showAlert(
      "Aluno cadastrado",
      `O aluno foi cadastrado, mas não foi possível atualizar a lista: ${error.message}`,
      "warning",
    );
    return;
  }
  await showAlert("Aluno cadastrado", "Ele já pode entrar no app com as credenciais informadas.", "success");
});

document.querySelector("#student-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await loadStudents(String(form.get("search") ?? "").trim());
  } catch (error) {
    await showAlert("Não foi possível buscar os alunos", error.message, "error");
  }
});

document.querySelector("#logout").addEventListener("click", () => {
  sessionStorage.removeItem(tokenKey);
  token = null;
  dashboard.hidden = true;
  loginSection.hidden = false;
});

if (token) {
  enterDashboard().catch((error) => {
    sessionStorage.removeItem(tokenKey);
    token = null;
    dashboard.hidden = true;
    loginSection.hidden = false;
    void showAlert("Não foi possível carregar o painel", error.message, "error");
  });
}
