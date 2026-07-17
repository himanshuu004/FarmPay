/**
 * RabbitMQ Connection Manager
 * Manages a single connection and channel to RabbitMQ with auto-reconnect.
 */

const amqplib = require('amqplib');
const config = require('./index');
const logger = require('../shared/utils/logger');

let connection = null;
let channel = null;

/**
 * Establishes a connection to RabbitMQ and creates a channel.
 * Reuses existing connection if already established.
 * @returns {Promise<amqplib.Channel>} AMQP channel
 */
const connectRabbitMQ = async () => {
  try {
    if (channel) return channel;

    connection = await amqplib.connect(config.rabbitmq.url);
    channel = await connection.createChannel();

    // Set prefetch to limit unacked messages per consumer
    await channel.prefetch(config.rabbitmq.prefetch);

    // Assert the main exchange
    await channel.assertExchange(config.rabbitmq.exchange, 'topic', {
      durable: true,
    });

    logger.info('RabbitMQ connected and channel created');

    // Handle connection close — trigger reconnect
    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed, will reconnect...');
      channel = null;
      connection = null;
      setTimeout(connectRabbitMQ, 5000);
    });

    connection.on('error', (err) => {
      logger.error('RabbitMQ connection error:', err.message);
    });

    return channel;
  } catch (err) {
    logger.error('Failed to connect to RabbitMQ:', err.message);
    // Retry after 5 seconds
    setTimeout(connectRabbitMQ, 5000);
    return null;
  }
};

/**
 * Returns the current RabbitMQ channel, connecting if needed.
 * @returns {Promise<amqplib.Channel>}
 */
const getChannel = async () => {
  if (!channel) {
    await connectRabbitMQ();
  }
  return channel;
};

/**
 * Gracefully closes the RabbitMQ connection.
 */
const closeRabbitMQ = async () => {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    channel = null;
    connection = null;
    logger.info('RabbitMQ connection closed gracefully');
  } catch (err) {
    logger.error('Error closing RabbitMQ connection:', err.message);
  }
};

module.exports = { connectRabbitMQ, getChannel, closeRabbitMQ };
