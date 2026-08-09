import { GameManager } from "./core/GameManager";
import { WechatRuntime } from "./platform/WechatRuntime";

const game = new GameManager(new WechatRuntime());
game.start();
