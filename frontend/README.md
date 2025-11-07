# Tumbul CRM - Frontend

React-based frontend for the Tumbul CRM contractor management system.

## Tech Stack

- **React 19** - UI library (JavaScript, no TypeScript)
- **React Router DOM** - Client-side routing
- **Vite** - Build tool and dev server
- **Axios** - HTTP client
- **Recharts** - Charts and analytics
- **date-fns** - Date formatting

## Getting Started

### Prerequisites

- Node.js 14+
- Backend server running on port 3000

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at http://localhost:3001

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── assets/
│   │   └── styles/         # Global CSS
│   ├── components/         # Reusable components
│   │   └── Layout.jsx      # Main layout with sidebar
│   ├── context/           # React context providers
│   │   └── AuthContext.jsx # Authentication state
│   ├── pages/             # Page components
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Clients.jsx
│   │   ├── Projects.jsx
│   │   ├── Invoices.jsx
│   │   ├── Expenses.jsx
│   │   └── TimeEntries.jsx
│   ├── services/          # API clients
│   │   └── api.js         # Axios instance and API methods
│   ├── App.jsx            # Root component with routing
│   └── main.jsx           # Entry point
├── index.html
├── vite.config.js
└── package.json
```

## Features

### Completed

- Authentication (Login/Register)
- Dashboard with analytics and charts
- Client management (CRUD)
- Project management (CRUD)
- Responsive sidebar navigation
- Protected routes
- API integration with backend

### In Progress

- Invoice management
- Expense tracking
- Time tracking with timer
- Client portal

## API Configuration

The frontend proxies API requests through Vite to the backend:

- Frontend: http://localhost:3001
- Backend API: http://localhost:3000
- Proxy: `/api/*` → `http://localhost:3000/api/*`

## Development

### Authentication Flow

1. User logs in via `/login`
2. JWT token stored in localStorage
3. Token automatically added to all API requests
4. Protected routes redirect to login if no token
5. Token removed on logout or 401 response

### Adding a New Page

1. Create component in `src/pages/`
2. Add route in `App.jsx`
3. Add navigation link in `Layout.jsx`
4. Create API methods in `services/api.js`

### Styling

- Global styles in `src/assets/styles/global.css`
- CSS variables for theming
- Component-specific CSS files
- Utility classes for common patterns

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
