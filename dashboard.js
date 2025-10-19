document.addEventListener('DOMContentLoaded', async () => {
  // --- 0. AUTH CONFIGURATION ---
  let auth0Client = null;
  const auth0Domain = 'slytechie.us.auth0.com';
  const auth0ClientId = 'D0DQmfItzJzwuwS1R7kRqHeUz66xhJXQ';

  // --- 1. GET REFERENCES TO HTML ELEMENTS ---
  const logoutBtn = document.getElementById('logout-btn');
  const userProfileEl = document.getElementById('user-profile');
  const userDisplayNameEl = document.getElementById('user-display-name');
  const profileSettingsBtn = document.getElementById('profile-settings-btn');
  const appList = document.getElementById('app-list');
  const exportBtn = document.getElementById('export-csv');

  // ---GEMINI API FUNCTION ---
  async function callGemini(prompt, apiKey) {
   const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      return 'Error: Could not get AI response.';
    }
  }

  async function handleAIPrep(event) {
    const index = event.target.dataset.index;
    const user = await auth0Client.getUser();
    if (!user) return;

    // Get the specific job
    const appKey = `applications_${user.sub}`;
    const { [appKey]: applications } = await chrome.storage.local.get([appKey]);
    const job = applications[index];
    
    // Get the user's resume
    const profileKey = `profile_${user.sub}`;
    const { [profileKey]: profile } = await chrome.storage.local.get([profileKey]);

    if (!profile || !profile.resume || !profile.apiKey) {
      alert('Please save your resume and Gemini API key in the extension popup first.');
      return;
    }

    const prompt = `
      You are an expert career coach.
      My Resume: "${profile.resume}"
      The Job I'm applying for: "${job.position} at ${job.company}"
      
      Please generate a 3-bullet-point answer to the interview question:
      "Why do you think you're a good fit for this role?"
    `;

    event.target.innerText = "Generating...";
    const response = await callGemini(prompt, profile.apiKey);
    alert(`AI Response:\n\n${response}`);
    event.target.innerText = "AI Prep";
  }

  async function handleAIScore(event) {
    const index = event.target.dataset.index;
    const user = await auth0Client.getUser();
    if (!user) return;

    const appKey = `applications_${user.sub}`;
    const { [appKey]: applications } = await chrome.storage.local.get([appKey]);
    const job = applications[index];
    
    const profileKey = `profile_${user.sub}`;
    const { [profileKey]: profile } = await chrome.storage.local.get([profileKey]);

    if (!profile || !profile.resume || !profile.apiKey) {
      alert('Please save your resume and Gemini API key in the extension popup first.');
      return;
    }

    const prompt = `
      Analyze my resume and a job description.
      My Resume: "${profile.resume}"
      Job: "${job.position} at ${job.company}"
      
      Calculate a percentage "fit" score and provide a one-sentence reason for that score.
      Format your response ONLY as: "SCORE% - REASON"
      Example: "85% - You are a strong fit because your React skills match the job."
    `;
    
    event.target.innerText = "Scoring...";
    const response = await callGemini(prompt, profile.apiKey);
    alert(`Match Score:\n\n${response}`);
    event.target.innerText = "Get Score";
  }

  async function handleDelete(event) {
    const index = event.target.dataset.index;
    if (!confirm('Are you sure you want to delete this application?')) {
      return;
    }

    const user = await auth0Client.getUser();
    if (!user) return;

    const appKey = `applications_${user.sub}`;
    const { [appKey]: applications } = await chrome.storage.local.get([appKey]);

    applications.splice(index, 1); // Remove the application at the specified index

    await chrome.storage.local.set({ [appKey]: applications });
    await loadAndDisplayApplications(); // Refresh the list
  }

  async function handleStatusChange(event) {
    const index = event.target.dataset.index;
    const newStatus = event.target.value;

    const user = await auth0Client.getUser();
    if (!user) return;

    const appKey = `applications_${user.sub}`;
    const { [appKey]: applications } = await chrome.storage.local.get([appKey]);

    if (applications[index]) {
      applications[index].status = newStatus;
      await chrome.storage.local.set({ [appKey]: applications });
      
      // Update the status text in the UI without a full reload
      const listItem = event.target.closest('li');
      const statusElement = listItem.querySelector('.app-status-text');
      if (statusElement) {
        statusElement.textContent = newStatus;
      }
    }
  }

  // --- CORE FUNCTIONS ---
  const loadAndDisplayApplications = async () => {
    const user = await auth0Client.getUser();
    if (!user) return;

    // **CRITICAL CHANGE**: Use a user-specific key for applications
    const appKey = `applications_${user.sub}`;
    const result = await chrome.storage.local.get([appKey]);
    const applications = result[appKey] || [];

    // Display applications, newest first
    appList.innerHTML = '';

    if (applications.length === 0) {
      appList.innerHTML = '<li>No applications saved yet. Use the extension icon on a job page to save one!</li>';
      return;
    }

    applications.reverse().forEach((app, index) => {
      const originalIndex = applications.length - 1 - index;
      const status = app.status || 'Applied'; // Default to 'Applied' if no status is set

      const listItem = document.createElement('li');
      listItem.innerHTML = `
        <div>
          <strong>${app.company}</strong> - ${app.position}
          <div class="app-details">
            <span>📍 ${app.location}</span>
            <span class="app-date">📅 ${app.date}</span>
            <span class="app-status">Status: <strong class="app-status-text">${status}</strong></span>
          </div>
        </div>
        <div class="app-tools">
          <select class="status-select" data-index="${originalIndex}">
            <option value="Applied" ${status === 'Applied' ? 'selected' : ''}>Applied</option>
            <option value="Interviewing" ${status === 'Interviewing' ? 'selected' : ''}>Interviewing</option>
            <option value="Selected" ${status === 'Selected' ? 'selected' : ''}>Selected</option>
            <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>Rejected</option>
          </select>
          <button class="ai-prep-btn" data-index="${originalIndex}">AI Prep</button>
          <button class="ai-score-btn" data-index="${originalIndex}">Get Score</button>
          <a href="${app.website}" target="_blank" class="website-link">Visit</a>
          <button class="delete-btn" data-index="${originalIndex}">Delete</button>
        </div>`;
      appList.appendChild(listItem);
    });
    
    // NEW: Add event listeners to all the new buttons
    document.querySelectorAll('.ai-prep-btn').forEach(btn => {
      btn.addEventListener('click', handleAIPrep);
    });
    document.querySelectorAll('.ai-score-btn').forEach(btn => {
      btn.addEventListener('click', handleAIScore);
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', handleDelete);
    });
    document.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', handleStatusChange);
    });
  };

  const handleExport = async () => {
    const user = await auth0Client.getUser();
    if (!user) return;

    // **CRITICAL CHANGE**: Export from the user-specific key
    const appKey = `applications_${user.sub}`;
    const result = await chrome.storage.local.get([appKey]);
    const applications = result[appKey] || [];
    
    if (applications.length === 0) {
      alert('No applications to export!');
      return;
    }

    let csvContent = "Company,Position,Location,Website,Date Applied\n";
    applications.forEach(app => {
      const company = `"${app.company.replace(/"/g, '""')}"`;
      const position = `"${app.position.replace(/"/g, '""')}"`;
      const location = `"${(app.location || '').replace(/"/g, '""')}"`;
      csvContent += [company, position, location, app.website, app.date].join(',') + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "job_applications.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const configureClient = async () => {
    auth0Client = await auth0.createAuth0Client({
      domain: auth0Domain,
      clientId: auth0ClientId
    });
  };

  const openProfileSettings = () => {
    window.location.href = chrome.runtime.getURL('profile.html');
  };

  const processLogin = async () => {
    // Check if the user is returning from Auth0
    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
      await auth0Client.handleRedirectCallback();
      // Clean the URL
      window.history.replaceState({}, document.title, "/dashboard.html");
    }

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (!isAuthenticated) {
      // Not logged in, redirect to Auth0 to login
      await auth0Client.loginWithRedirect({
        authorizationParams: {
          redirect_uri: chrome.runtime.getURL('dashboard.html')
        }
      });
    } else {
      // Logged in, update UI and load data
      const user = await auth0Client.getUser();
      userProfileEl.style.display = 'flex';
      userProfileEl.style.alignItems = 'center';
      profileSettingsBtn.addEventListener('click', openProfileSettings);
      logoutBtn.style.display = 'block';
      userDisplayNameEl.textContent = user.name || user.nickname || user.email;
      
      loadAndDisplayApplications();
      exportBtn.addEventListener('click', handleExport);
      logoutBtn.addEventListener('click', () => {
        auth0Client.logout({
          logoutParams: {
            returnTo: chrome.runtime.getURL('dashboard.html')
          }
        });
      });
    }
  };

  // --- 3. INITIALIZE THE PAGE ---
  const initialize = async () => {
    await configureClient();
    await processLogin();
  };

  initialize();
});