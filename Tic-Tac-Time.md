# Hackathon Submission: Tic-Tac-Time

## GitHub handle
blatantstriker

## Project Title
Tic-Tac-Time - 4D Tic-Tac-Toe with Time Travel Mechanics

## Project Description    
Tic-Tac-Time is an innovative twist on the classic Tic-Tac-Toe game that takes strategic gameplay to a whole new dimension—literally! This project features a fully-functional 4D Tic-Tac-Toe game where players battle across a 3×3×3×3 hypercube, incorporating X, Y, Z, and **Time** dimensions.

The game offers three distinct modes:
- **Normal Mode**: Classic 3D Tic-Tac-Toe on a single cube with 49 possible winning combinations
- **Fight Across Time Mode**: Strategic 4D gameplay where players can alter the past to reshape the present and future, with 147+ winning combinations
- **Local Multiplayer**: Hot-seat play on the same device

Key features include:
- **Real-time Online Multiplayer** with custom rooms and password protection
- **AI Opponents** with multiple difficulty levels (Easy, Medium, Hard, Impossible)
- **Beautiful 3D Visualization** using Three.js with smooth animations and particle effects
- **Intuitive UI** with keyboard shortcuts, responsive design, and accessibility options
- **Secure Authentication** with email/password login and guest mode

## Inspiration behind the Project  
The inspiration for Tic-Tac-Time came from a fascination with time travel mechanics in games and the desire to create something truly unique for Hacktoberfest 2025. Traditional Tic-Tac-Toe becomes trivial once you learn the strategy, but what if we could add an entirely new dimension—time itself?

I wanted to explore how strategic gameplay could evolve when players can manipulate not just space, but also temporal states. The concept of making moves in the past that create chain reactions in the present and future adds layers of complexity that make every match unique and engaging.

The goal was to build a game that's easy to understand but difficult to master, while showcasing the powerful capabilities of modern web technologies and Appwrite's real-time features. This project demonstrates that web-based games can deliver sophisticated, visually stunning experiences without requiring downloads or installations.

## Tech Stack    
The project is built using modern web technologies with a focus on performance and user experience:

**Frontend:**
- **Three.js (v0.160.0)**: Powers the 3D graphics rendering engine for visualizing the 4D hypercube
- **Vanilla JavaScript (ES2020+)**: Zero framework overhead for maximum performance (~5KB gzipped)
- **Vite (v7.1.12)**: Lightning-fast build tool and development server
- **CSS3**: Custom animations, particle effects, and responsive design

**Backend:**
- **Appwrite (v14.0.1)**: Complete Backend-as-a-Service solution
  - Database for game state management
  - Real-time subscriptions for live multiplayer
  - Authentication for user management
  - Session handling and security

**Development Tools:**
- **Node.js**: Development environment
- **Git**: Version control
- Automated setup script for Appwrite database configuration

**Architecture Highlights:**
- Minimax algorithm with alpha-beta pruning for AI opponents
- Real-time WebSocket connections for instant game updates
- Client-side SHA-256 password hashing for secure room protection
- Efficient 4D win detection algorithm scanning 147+ patterns
- Interactive raycasting for 3D cell selection

### Appwrite products
- [x] Auth
- [x] Databases
- [ ] Storage
- [ ] Functions
- [ ] Messaging
- [x] Realtime
- [x] Sites

## Project Repo  
https://github.com/blatant-striker/tic-tac-time

## Deployed Site URL
https://tic-tac-time.appwrite.network

## Demo Video/Photos  

<img width="1920" height="1080" alt="Tic-Tac-Time Game Menu" src="https://github.com/user-attachments/assets/f60bf56e-9237-4bb4-a5e4-52f5452b6138" />
<img width="1920" height="1080" alt="4D Game Board" src="https://github.com/user-attachments/assets/da817901-13c5-4b9d-8221-dea6afafd74c" />
<img width="1920" height="1080" alt="Time Travel Mechanics" src="https://github.com/user-attachments/assets/e90ce523-79c6-4188-b620-a8659be2ffbe" />
<img width="1920" height="1080" alt="Multiplayer Lobby" src="https://github.com/user-attachments/assets/7171ce58-9dc2-4a6d-b817-57918f79a05d" />
