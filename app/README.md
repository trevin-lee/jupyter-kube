# Electron React App

A modern Electron application built with React, TypeScript, Vite, and shadcn/ui.

## Features

- ⚡ **Fast Development** - Powered by Vite for lightning-fast HMR
- ⚛️ **React 18** - Latest React with TypeScript support
- 🎨 **shadcn/ui** - Beautiful and accessible UI components
- 🌙 **Dark/Light Mode** - Built-in theme switching
- 📱 **Responsive Design** - Tailwind CSS for styling
- 🖥️ **Cross-Platform** - Electron for desktop app deployment
- 🔧 **TypeScript** - Full type safety
- 📦 **Modern Tooling** - ESLint, PostCSS, and more

## Tech Stack

- **Frontend**: React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **Build Tool**: Vite
- **Desktop**: Electron
- **Icons**: Lucide React
- **State Management**: React Hooks

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run electron:dev
   ```

   This will start both the Vite dev server and Electron app concurrently.

### Build for Production

1. Build the application:
   ```bash
   npm run app:build
   ```

2. The built app will be available in the `release` directory.

## Available Scripts

- `npm run dev` - Start Vite development server
- `npm run electron:dev` - Start both Vite and Electron in development mode
- `npm run build` - Build for production
- `npm run app:build` - Build and package the Electron app
- `npm run lint` - Run ESLint
- `npm run preview` - Preview the production build

## Project Structure

```
app/
├── electron/           # Electron main process files
│   ├── main.ts        # Main Electron process
│   └── preload.ts     # Preload script
├── src/               # React application
│   ├── components/    # React components
│   │   └── ui/       # shadcn/ui components
│   ├── lib/          # Utility functions
│   ├── App.tsx       # Main App component
│   ├── main.tsx      # React entry point
│   └── index.css     # Global styles
├── index.html        # HTML template
├── package.json      # Dependencies and scripts
├── vite.config.ts    # Vite configuration
├── tailwind.config.js # Tailwind CSS configuration
└── tsconfig.json     # TypeScript configuration
```

## Adding New shadcn/ui Components

This project is set up to work with shadcn/ui components. You can add new components using:

```bash
npx shadcn-ui@latest add [component-name]
```

## Customization

### Themes

The app supports light/dark mode switching. Colors and themes can be customized in:
- `src/index.css` - CSS variables for theme colors
- `tailwind.config.js` - Tailwind configuration

### Electron Configuration

Electron settings can be modified in:
- `electron/main.ts` - Main process configuration
- `electron/preload.ts` - Preload script for secure communication
- `package.json` - Build configuration under the "build" key

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 