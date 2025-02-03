Neutralino.init();

let tasks = [];
let currentTheme = "light";
let chart = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  setupEventListeners();
  startSystemMonitoring();
  updateDateTime();
  setInterval(updateDateTime, 1000);
});

async function initializeApp() {
  await loadTasks();
  setupChart();
  updateTasksView();
  updateAnalytics();
}

function setupEventListeners() {
  document
    .getElementById("addTaskForm")
    .addEventListener("submit", handleAddTask);
  document
    .getElementById("theme-selector")
    .addEventListener("change", changeTheme);
  document
    .getElementById("searchInput")
    .addEventListener("input", handleSearch);
}

async function loadTasks() {
  try {
    const data = await Neutralino.storage.getData("tasks");
    tasks = JSON.parse(data);
  } catch {
    tasks = [];
    await saveTasks();
  }
}

async function saveTasks() {
  await Neutralino.storage.setData("tasks", JSON.stringify(tasks));
  updateTasksView();
  updateAnalytics();
}

function handleAddTask(e) {
  e.preventDefault();

  const task = {
    id: Date.now(),
    title: document.getElementById("taskTitle").value,
    description: document.getElementById("taskDescription").value,
    dueDate: document.getElementById("taskDueDate").value,
    priority: document.getElementById("taskPriority").value,
    status: "todo",
    createdAt: new Date().toISOString(),
  };

  tasks.push(task);
  saveTasks();
  closeAddTaskModal();
  showNotification("Task added successfully!");
}

function updateTasksView() {
  const containers = {
    todo: document.querySelector("#todo .tasks-container"),
    "in-progress": document.querySelector("#in-progress .tasks-container"),
    completed: document.querySelector("#completed .tasks-container"),
  };

  Object.values(containers).forEach((container) => (container.innerHTML = ""));

  const sortedTasks = [...tasks].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  sortedTasks.forEach((task) => {
    const taskElement = createTaskElement(task);
    containers[task.status].appendChild(taskElement);
  });
}

function createTaskElement(task) {
  const div = document.createElement("div");
  div.className = "task-card";
  div.draggable = true;
  div.id = `task-${task.id}`;

  const priorityColors = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#10b981",
  };

  div.innerHTML = `
        <h3>${task.title}</h3>
        <p>${task.description}</p>
        <div class="task-meta">
            <span style="color: ${priorityColors[task.priority]}">
                <i class="fas fa-flag"></i> ${task.priority}
            </span>
            <span>
                <i class="fas fa-calendar"></i> ${formatDate(task.dueDate)}
            </span>
        </div>
    `;

  div.addEventListener("dragstart", handleDragStart);
  div.addEventListener("dragend", handleDragEnd);

  return div;
}

function handleDragStart(e) {
  e.target.classList.add("dragging");
  e.dataTransfer.setData("text/plain", e.target.id);
}

function handleDragEnd(e) {
  e.target.classList.remove("dragging");
}

function allowDrop(e) {
  e.preventDefault();
}

function drop(e) {
  e.preventDefault();
  const taskId = e.dataTransfer.getData("text/plain").replace("task-", "");
  const newStatus = e.target.closest(".column").id;

  const taskIndex = tasks.findIndex((t) => t.id === parseInt(taskId));
  if (taskIndex !== -1) {
    tasks[taskIndex].status = newStatus;
    saveTasks();
    showNotification("Task status updated!");
  }
}

function setupChart() {
  const ctx = document.getElementById("tasksChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["To Do", "In Progress", "Completed"],
      datasets: [
        {
          label: "Tasks by Status",
          data: [0, 0, 0],
          backgroundColor: [
            "rgba(37, 99, 235, 0.5)",
            "rgba(245, 158, 11, 0.5)",
            "rgba(16, 185, 129, 0.5)",
          ],
          borderColor: [
            "rgb(37, 99, 235)",
            "rgb(245, 158, 11)",
            "rgb(16, 185, 129)",
          ],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
      },
    },
  });
}

function updateAnalytics() {
  const stats = {
    todo: tasks.filter((t) => t.status === "todo").length,
    "in-progress": tasks.filter((t) => t.status === "in-progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  chart.data.datasets[0].data = [
    stats.todo,
    stats["in-progress"],
    stats.completed,
  ];
  chart.update();

  document.getElementById("completed-count").textContent = stats.completed;
  document.getElementById("pending-count").textContent =
    stats.todo + stats["in-progress"];

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyTasks = tasks.filter(
    (t) => new Date(t.createdAt) > oneWeekAgo
  ).length;
  document.getElementById("weekly-count").textContent = weeklyTasks;
}

async function startSystemMonitoring() {
  setInterval(async () => {
    try {
      const stats = await Neutralino.computer.getMemoryInfo();
      const cpuUsage = await Neutralino.computer.getCPUUsage();

      document.getElementById(
        "cpu-usage"
      ).textContent = `CPU: ${cpuUsage.toFixed(1)}%`;
      document.getElementById(
        "memory-usage"
      ).textContent = `Memory: ${Math.round(
        stats.used / (1024 * 1024)
      )}MB / ${Math.round(stats.total / (1024 * 1024))}MB`;
    } catch (error) {
      console.error("Error fetching system stats:", error);
    }
  }, 1000);
}

async function openFileDialog() {
  try {
    const entry = await Neutralino.os.showOpenDialog("Select a file", {
      filters: [{ name: "All files", extensions: ["*"] }],
    });

    if (entry) {
      const fileName = entry.split("/").pop();
      await addFileToList(fileName, entry);
      showNotification("File added successfully!");
    }
  } catch (error) {
    showNotification("Error opening file", "error");
  }
}

async function addFileToList(fileName, path) {
  const fileList = document.getElementById("file-list");
  const fileItem = document.createElement("div");
  fileItem.className = "file-item";

  const extension = fileName.split(".").pop().toLowerCase();
  const icon = getFileIcon(extension);

  fileItem.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${fileName}</span>
    `;

  fileItem.addEventListener("click", () => openFile(path));
  fileList.appendChild(fileItem);
}

function getFileIcon(extension) {
  const icons = {
    pdf: "fa-file-pdf",
    doc: "fa-file-word",
    docx: "fa-file-word",
    xls: "fa-file-excel",
    xlsx: "fa-file-excel",
    txt: "fa-file-alt",
    jpg: "fa-file-image",
    jpeg: "fa-file-image",
    png: "fa-file-image",
  };

  return icons[extension] || "fa-file";
}

async function openFile(path) {
  try {
    await Neutralino.os.open(path);
  } catch (error) {
    showNotification("Error opening file", "error");
  }
}

function switchView(viewName) {
  document
    .querySelectorAll(".view")
    .forEach((view) => view.classList.remove("active"));
  document.getElementById(`${viewName}-view`).classList.add("active");

  document
    .querySelectorAll("nav a")
    .forEach((link) => link.classList.remove("active"));
  document
    .querySelector(`nav a[onclick="switchView('${viewName}')"]`)
    .classList.add("active");
}

function showAddTaskModal() {
  document.getElementById("addTaskModal").style.display = "block";
}

function closeAddTaskModal() {
  document.getElementById("addTaskModal").style.display = "none";
  document.getElementById("addTaskForm").reset();
}

function changeTheme() {
  const theme = document.getElementById("theme-selector").value;
  document.documentElement.setAttribute("data-theme", theme);
  currentTheme = theme;
}

function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();
  const taskCards = document.querySelectorAll(".task-card");

  taskCards.forEach((card) => {
    const title = card.querySelector("h3").textContent.toLowerCase();
    const description = card.querySelector("p").textContent.toLowerCase();

    if (title.includes(searchTerm) || description.includes(searchTerm)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

function formatDate(dateString) {
  const options = { year: "numeric", month: "short", day: "numeric" };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

function updateDateTime() {
  const now = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  document.getElementById("datetime").textContent = now.toLocaleDateString(
    undefined,
    options
  );
}

function showNotification(message, type = "success") {
  Neutralino.os.showNotification("TaskFlow", message);
}

Neutralino.events.on("windowClose", () => {
  Neutralino.app.exit();
});

window.onerror = function (message, source, lineno, colno, error) {
  showNotification(`Error: ${message}`, "error");
  console.error("Application error:", error);
  return true;
};
