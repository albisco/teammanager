// PlayHQ API client — stub for future integration

export interface PlayHQConfig {
  apiKey: string;
  baseUrl?: string;
}

export class PlayHQClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: PlayHQConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.playhq.com/v1";
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCompetitions() {
    throw new Error(`PlayHQ integration not yet implemented (${this.baseUrl}, key: ${this.apiKey.slice(0, 4)}...)`);
  }

  async getTeams(_competitionId: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error("PlayHQ integration not yet implemented");
  }

  async getPlayers(_teamId: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error("PlayHQ integration not yet implemented");
  }

  async getFixtures(_competitionId: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error("PlayHQ integration not yet implemented");
  }
}
