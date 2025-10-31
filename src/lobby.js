// Lobby system for multiplayer matchmaking
export class Lobby {
  constructor(appwriteService, authService) {
    this.appwrite = appwriteService;
    this.auth = authService;
    this.currentLobby = null;
    this.activeGames = [];
  }

  async createLobby(gameMode) {
    if (!this.auth.isLoggedIn()) {
      throw new Error('Must be logged in to create lobby');
    }

    const user = this.auth.getUser();
    this.currentLobby = {
      id: `lobby_${Date.now()}`,
      gameMode,
      host: {
        id: user.$id,
        name: this.auth.getUserName()
      },
      guest: null,
      status: 'waiting',
      createdAt: Date.now()
    };

    return this.currentLobby;
  }

  async findLobbies(gameMode) {
    try {
      const response = await this.appwrite.databases.listDocuments(
        this.appwrite.databaseId,
        this.appwrite.collectionId
      );

      const lobbies = response.documents
        .filter(game => 
          game.status === 'waiting' && 
          game.gameMode === gameMode &&
          game.player1 !== this.auth.getUser()?.$id
        )
        .map(game => ({
          id: game.$id,
          gameMode: game.gameMode,
          roomName: game.roomName || '',
          host: { name: game.player1Name || 'Player' },
          createdAt: new Date(game.$createdAt).getTime(),
          updatedAt: new Date(game.$updatedAt).getTime(),
          hasPassword: !!game.passwordHash
        }));

      return lobbies;
    } catch (error) {
      console.error('Failed to find lobbies:', error);
      return [];
    }
  }

  async joinLobby(lobbyId) {
    if (!this.auth.isLoggedIn()) {
      throw new Error('Must be logged in to join lobby');
    }

    try {
      const player2Name = this.auth.getUserName();
      const game = await this.appwrite.joinGame(lobbyId, player2Name);
      return game;
    } catch (error) {
      throw new Error('Failed to join lobby: ' + error.message);
    }
  }

  async refreshLobbies(gameMode) {
    return await this.findLobbies(gameMode);
  }

  leaveLobby() {
    this.currentLobby = null;
  }
}
