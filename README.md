# ExpenseOS ⚡

ExpenseOS is a premium, terminal-inspired personal finance tracker built for speed and aesthetic precision. It transforms mundane expense logging into a high-performance command-line experience, powered by AI for natural language processing.

![ExpenseOS Preview](/Users/aayush/CAPSTONE PROJECT/ExpenseOs.png)

## ✨ Features

- **Terminal-Grade Interface**: A sleek, dark-themed UI featuring scanlines, grid backgrounds, and smooth CRT-style animations.
- **AI-Powered Logging**: Simply type `250 Zomato lunch` or `1200 Amazon headphones`. ExpenseOS uses the **Google Gemini API** to automatically parse amounts, categories, and descriptions.
- **Smart Categorization**: Automatically groups your spending into `Food`, `Transport`, `Shopping`, `Health`, `Entertainment`, and `Other`.
- **Advanced Dashboard**: Visualize your spending habits with interactive charts (Powered by **Recharts**) including:
  - Category Distribution (Pie Charts)
  - 7-Day Spending Trends
  - Weekly Comparisons
- **Google Authentication**: Securely sync your data across devices using Firebase Google Auth.
- **Real-time Persistence**: Your data is stored safely in **Firebase Firestore**, ensuring you never lose a log.
- **Budget Alerts**: Set custom category thresholds and get visual alerts when you're nearing your limits.
- **Offline Fallback**: Even without an AI connection, a robust local regex parser ensures your logs are never interrupted.

## 🚀 Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: Vanilla CSS (Modern Terminal Aesthetic)
- **Database & Auth**: [Firebase](https://firebase.google.com/) (Firestore & Google Auth)
- **AI Engine**: [Google Gemini API](https://ai.google.dev/)
- **Data Viz**: [Recharts](https://recharts.org/)

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18+)
- A Firebase Project
- A Google AI (Gemini) API Key

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Aayush2141/Finance-Tracker.git
   cd Finance-Tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configuration**:
   Open `src/App.jsx` and replace the placeholder constants with your own credentials:
   - `GEMINI_KEY`: Your Google AI API key.
   - `firebaseConfig`: Your Firebase project configuration.

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## ⌨️ Usage

ExpenseOS is designed to be used primarily via the "Command Bar" at the top:

1. **Log an Expense**: Type your expense in natural language and press `Enter`.
   - `80 auto to station`
   - `₹500 pharmacy medicines`
   - `350 swiggy dinner`
2. **Switch Views**: Use the sidebar to toggle between **Log**, **Dashboard**, **Insights**, and **Settings**.
3. **Analyze**: Head to the Dashboard to see your weekly trends and category breakdowns.

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---
