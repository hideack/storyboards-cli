const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

export const log = {
  info(message: string): void {
    console.log(`${CYAN}info${RESET}  ${message}`);
  },
  success(message: string): void {
    console.log(`${GREEN}ok${RESET}    ${message}`);
  },
  warn(message: string): void {
    console.warn(`${YELLOW}warn${RESET}  ${message}`);
  },
  error(message: string): void {
    console.error(`${RED}error${RESET} ${message}`);
  },
  muted(message: string): void {
    console.log(`${GRAY}${message}${RESET}`);
  },
  plain(message: string): void {
    console.log(message);
  },
};
