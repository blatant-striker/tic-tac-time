import { Client, Databases, ID, Query } from 'appwrite';

export class AppwriteService {
  constructor() {
    this.client = new Client()
      .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
      .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

    this.databases = new Databases(this.client);
    this.databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID;
    this.collectionId = import.meta.env.VITE_APPWRITE_COLLECTION_ID;
    this.currentGameId = null;
    this.playerId = this.getOrCreatePlayerId();
    this.unsubscribe = null;
  }

  async updateStatus(status) {
    if (!this.currentGameId) return;
    try {
      return await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        this.currentGameId,
        { status }
      );
    } catch (error) {
      console.error('Failed to update status:', error);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }

  getOrCreatePlayerId() {
    let id = localStorage.getItem('playerId');
    if (!id) {
      id = ID.unique();
      localStorage.setItem('playerId', id);
    }
    return id;
  }

  async createGame(gameMode, options = {}) {
    try {
      const game = await this.databases.createDocument(
        this.databaseId,
        this.collectionId,
        ID.unique(),
        {
          gameMode,
          board: JSON.stringify([]),
          currentPlayer: 'X',
          winner: null,
          status: 'waiting',
          player1: this.playerId,
          player2: null,
          currentTime: gameMode === 'time' ? 1 : 0,
          ...(options.passwordHash ? { passwordHash: options.passwordHash } : {}),
          ...(options.roomName ? { roomName: options.roomName } : {})
        }
      );
      
      this.currentGameId = game.$id;
      return game;
    } catch (error) {
      console.error('Failed to create game:', error);
      throw error;
    }
  }

  async joinGame(gameId) {
    try {
      const game = await this.databases.getDocument(
        this.databaseId,
        this.collectionId,
        gameId
      );

      if (game.status !== 'waiting') {
        throw new Error('Game already started or finished');
      }

      if (game.player1 === this.playerId) {
        throw new Error('Cannot join your own game');
      }

      const updated = await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        gameId,
        {
          player2: this.playerId,
          status: 'ready'
        }
      );

      this.currentGameId = gameId;
      return updated;
    } catch (error) {
      console.error('Failed to join game:', error);
      throw error;
    }
  }

  async findAvailableGame(gameMode) {
    try {
      const response = await this.databases.listDocuments(
        this.databaseId,
        this.collectionId
      );

      const availableGame = response.documents.find(
        game => game.status === 'waiting' && 
                game.gameMode === gameMode &&
                game.player1 !== this.playerId &&
                !game.passwordHash
      );

      if (availableGame) {
        return await this.joinGame(availableGame.$id);
      }

      return await this.createGame(gameMode);
    } catch (error) {
      console.error('Failed to find/create game:', error);
      throw error;
    }
  }

  async updateGame(board, currentPlayer, currentTime, winner = null) {
    if (!this.currentGameId) return;

    try {
      const updateData = {
        board: typeof board === 'string' ? board : JSON.stringify(board),
        currentPlayer,
        currentTime
      };

      if (winner) {
        updateData.winner = winner;
        updateData.status = 'finished';
      }

      return await this.databases.updateDocument(
        this.databaseId,
        this.collectionId,
        this.currentGameId,
        updateData
      );
    } catch (error) {
      console.error('Failed to update game:', error);
      throw error;
    }
  }

  subscribeToGame(gameId, callback) {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.currentGameId = gameId;

    // Subscribe to real-time updates
    this.unsubscribe = this.client.subscribe(
      `databases.${this.databaseId}.collections.${this.collectionId}.documents.${gameId}`,
      (response) => {
        if (response.events.includes('databases.*.collections.*.documents.*.update')) {
          callback(response.payload);
        }
      }
    );
  }

  async getGame(gameId) {
    try {
      return await this.databases.getDocument(
        this.databaseId,
        this.collectionId,
        gameId
      );
    } catch (error) {
      console.error('Failed to get game:', error);
      throw error;
    }
  }

  async deleteGame(gameId) {
    try {
      await this.databases.deleteDocument(
        this.databaseId,
        this.collectionId,
        gameId
      );
    } catch (error) {
      console.error('Failed to delete game:', error);
    }
  }

  unsubscribeFromGame() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  getPlayerSymbol(game) {
    if (game.player1 === this.playerId) return 'X';
    if (game.player2 === this.playerId) return 'O';
    return null;
  }

  isMyTurn(game) {
    const mySymbol = this.getPlayerSymbol(game);
    return mySymbol === game.currentPlayer;
  }

  reset() {
    this.unsubscribeFromGame();
    this.currentGameId = null;
  }

  async cleanupStaleGames(minutes = 10) {
    try {
      const cutoffISO = new Date(Date.now() - minutes * 60 * 1000).toISOString();
      let cursor = null;
      while (true) {
        const queries = [
          Query.lessThan('$updatedAt', cutoffISO),
          Query.equal('status', ['waiting', 'ready', 'finished']),
          Query.orderAsc('$updatedAt'),
          Query.limit(100)
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const res = await this.databases.listDocuments(
          this.databaseId,
          this.collectionId,
          queries
        );

        if (!res.documents || res.documents.length === 0) break;

        for (const doc of res.documents) {
          if (doc.$id === this.currentGameId) continue; // skip currently open game
          try {
            await this.databases.deleteDocument(this.databaseId, this.collectionId, doc.$id);
          } catch (e) {
            console.warn('Cleanup delete failed for', doc.$id, e?.message || e);
          }
        }

        cursor = res.documents[res.documents.length - 1].$id;
        if (res.documents.length < 100) break;
      }
    } catch (error) {
      console.error('Cleanup stale games failed:', error);
    }
  }

}
