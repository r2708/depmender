import chalk from 'chalk';

/**
 * CLI formatting utilities for consistent and attractive output
 * Requirement 6.4: Clean, formatted output with clear summaries
 */
export class CLIFormatter {
  
  /**
   * Creates a formatted header with title and separator
   */
  static header(title: string, width: number = 60): string {
    const separator = '='.repeat(width);
    return chalk.bold.cyan(`${separator}\n${title}\n${separator}`);
  }

  /**
   * Creates a formatted section header
   */
  static sectionHeader(title: string, width: number = 30): string {
    const separator = '-'.repeat(width);
    return chalk.bold.yellow(`${title}\n${separator}`);
  }

  /**
   * Formats success messages
   */
  static success(message: string): string {
    return chalk.green(`✅ ${message}`);
  }

  /**
   * Formats error messages
   */
  static error(message: string): string {
    return chalk.red(`❌ ${message}`);
  }

  /**
   * Formats warning messages
   */
  static warning(message: string): string {
    return chalk.yellow(`⚠️  ${message}`);
  }

  /**
   * Formats info messages
   */
  static info(message: string): string {
    return chalk.blue(`ℹ️  ${message}`);
  }

  /**
   * Formats critical messages
   */
  static critical(message: string): string {
    return chalk.red.bold(`🚨 ${message}`);
  }

  /**
   * Formats health score with appropriate color
   */
  static healthScore(score: number): string {
    let color = chalk.red;
    let indicator = '💀 Critical';
    
    if (score >= 90) {
      color = chalk.green;
      indicator = '🟢 Excellent';
    } else if (score >= 75) {
      color = chalk.yellow;
      indicator = '🟡 Good';
    } else if (score >= 50) {
      color = chalk.hex('#FFA500'); // Orange
      indicator = '🟠 Fair';
    } else if (score >= 25) {
      color = chalk.red;
      indicator = '🔴 Poor';
    }
    
    return color.bold(`${score}/100 ${indicator}`);
  }

  /**
   * Formats package information
   */
  static packageInfo(name: string, version: string): string {
    return `${chalk.cyan.bold(name)} ${chalk.gray(`v${version}`)}`;
  }

  /**
   * Formats issue counts with appropriate colors
   */
  static issueCount(count: number, type: string): string {
    if (count === 0) {
      return chalk.green(`${count} ${type}`);
    } else if (count <= 5) {
      return chalk.yellow(`${count} ${type}`);
    } else {
      return chalk.red(`${count} ${type}`);
    }
  }

  /**
   * Formats command suggestions
   */
  static command(command: string): string {
    return chalk.cyan.bold(`\`${command}\``);
  }

  /**
   * Formats file paths
   */
  static path(filePath: string): string {
    return chalk.gray(filePath);
  }

  /**
   * Creates a progress bar representation
   */
  static progressBar(current: number, total: number, width: number = 20): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    return `${bar} ${percentage}%`;
  }

  /**
   * Formats a list with bullets
   */
  static bulletList(items: string[], bullet: string = '•'): string {
    return items.map(item => `  ${chalk.gray(bullet)} ${item}`).join('\n');
  }

  /**
   * Formats a numbered list
   */
  static numberedList(items: string[]): string {
    return items.map((item, index) => `  ${chalk.gray(`${index + 1}.`)} ${item}`).join('\n');
  }

  /**
   * Creates a box around text
   */
  static box(content: string, padding: number = 1): string {
    const lines = content.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    const width = maxLength + (padding * 2);
    
    const top = '┌' + '─'.repeat(width) + '┐';
    const bottom = '└' + '─'.repeat(width) + '┘';
    const paddedLines = lines.map(line => 
      '│' + ' '.repeat(padding) + line.padEnd(maxLength) + ' '.repeat(padding) + '│'
    );
    
    return [top, ...paddedLines, bottom].join('\n');
  }

  /**
   * Formats help text with proper indentation
   */
  static helpText(sections: { title: string; content: string[] }[]): string {
    const output: string[] = [];
    
    sections.forEach((section, index) => {
      if (index > 0) output.push(''); // Add spacing between sections
      
      output.push(chalk.bold.cyan(section.title));
      section.content.forEach(line => {
        output.push(`  ${line}`);
      });
    });
    
    return output.join('\n');
  }

  /**
   * Formats a table with headers and rows
   */
  static table(headers: string[], rows: string[][]): string {
    const columnWidths = headers.map((header, index) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[index] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    const formatRow = (row: string[], isHeader: boolean = false) => {
      const formattedCells = row.map((cell, index) => {
        const padded = (cell || '').padEnd(columnWidths[index]);
        return isHeader ? chalk.bold.cyan(padded) : padded;
      });
      return `  ${formattedCells.join('  ')}`;
    };

    const separator = '  ' + columnWidths.map(width => '-'.repeat(width)).join('  ');

    const output = [
      formatRow(headers, true),
      separator,
      ...rows.map(row => formatRow(row))
    ];

    return output.join('\n');
  }
}