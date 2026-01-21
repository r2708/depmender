import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Progress indicator utility for long-running operations
 * Requirement 6.5: Progress indicators for long-running operations
 */
export class ProgressIndicator {
  private spinner: Ora;
  private startTime: number;

  constructor(initialText: string = 'Processing...') {
    this.spinner = ora({
      text: initialText,
      color: 'cyan',
      spinner: 'dots'
    });
    this.startTime = Date.now();
  }

  /**
   * Starts the progress indicator
   */
  start(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.start();
  }

  /**
   * Updates the progress text
   */
  updateText(text: string): void {
    this.spinner.text = text;
  }

  /**
   * Updates progress with step information
   */
  updateStep(currentStep: number, totalSteps: number, stepDescription: string): void {
    const percentage = Math.round((currentStep / totalSteps) * 100);
    this.spinner.text = `[${currentStep}/${totalSteps}] ${stepDescription} (${percentage}%)`;
  }

  /**
   * Shows success and stops the spinner
   */
  succeed(text?: string): void {
    const elapsed = this.getElapsedTime();
    const finalText = text ? `${text} ${chalk.gray(`(${elapsed})`)}` : undefined;
    this.spinner.succeed(finalText);
  }

  /**
   * Shows failure and stops the spinner
   */
  fail(text?: string): void {
    const elapsed = this.getElapsedTime();
    const finalText = text ? `${text} ${chalk.gray(`(${elapsed})`)}` : undefined;
    this.spinner.fail(finalText);
  }

  /**
   * Shows warning and stops the spinner
   */
  warn(text?: string): void {
    const elapsed = this.getElapsedTime();
    const finalText = text ? `${text} ${chalk.gray(`(${elapsed})`)}` : undefined;
    this.spinner.warn(finalText);
  }

  /**
   * Shows info and stops the spinner
   */
  info(text?: string): void {
    const elapsed = this.getElapsedTime();
    const finalText = text ? `${text} ${chalk.gray(`(${elapsed})`)}` : undefined;
    this.spinner.info(finalText);
  }

  /**
   * Stops the spinner without showing a symbol
   */
  stop(): void {
    this.spinner.stop();
  }

  /**
   * Temporarily stops the spinner to allow other output
   */
  pause(): void {
    this.spinner.stop();
  }

  /**
   * Resumes the spinner after a pause
   */
  resume(text?: string): void {
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.start();
  }

  /**
   * Gets elapsed time since creation
   */
  private getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime;
    if (elapsed < 1000) {
      return `${elapsed}ms`;
    } else {
      return `${(elapsed / 1000).toFixed(1)}s`;
    }
  }

  /**
   * Creates a multi-step progress indicator
   */
  static createMultiStep(steps: string[]): MultiStepProgress {
    return new MultiStepProgress(steps);
  }
}

/**
 * Multi-step progress indicator for complex operations
 */
export class MultiStepProgress {
  private steps: string[];
  private currentStep: number = 0;
  private spinner: Ora;
  private startTime: number;

  constructor(steps: string[]) {
    this.steps = steps;
    this.startTime = Date.now();
    this.spinner = ora({
      text: this.getStepText(),
      color: 'cyan',
      spinner: 'dots'
    });
  }

  /**
   * Starts the multi-step progress
   */
  start(): void {
    this.spinner.start();
  }

  /**
   * Advances to the next step
   */
  nextStep(): void {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.spinner.text = this.getStepText();
    }
  }

  /**
   * Completes the current step and advances
   */
  completeStep(customText?: string): void {
    const stepText = customText || this.steps[this.currentStep];
    this.spinner.succeed(`${chalk.green('✓')} ${stepText}`);
    
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.spinner = ora({
        text: this.getStepText(),
        color: 'cyan',
        spinner: 'dots'
      }).start();
    }
  }

  /**
   * Fails the current step
   */
  failStep(errorText?: string): void {
    const stepText = errorText || `Failed: ${this.steps[this.currentStep]}`;
    this.spinner.fail(stepText);
  }

  /**
   * Completes all remaining steps successfully
   */
  complete(finalText?: string): void {
    const elapsed = this.getElapsedTime();
    const text = finalText || 'All steps completed successfully';
    this.spinner.succeed(`${text} ${chalk.gray(`(${elapsed})`)}`);
  }

  /**
   * Gets the current step text with progress indicator
   */
  private getStepText(): string {
    const progress = `[${this.currentStep + 1}/${this.steps.length}]`;
    const percentage = Math.round(((this.currentStep + 1) / this.steps.length) * 100);
    return `${progress} ${this.steps[this.currentStep]} (${percentage}%)`;
  }

  /**
   * Gets elapsed time since creation
   */
  private getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime;
    if (elapsed < 1000) {
      return `${elapsed}ms`;
    } else {
      return `${(elapsed / 1000).toFixed(1)}s`;
    }
  }
}