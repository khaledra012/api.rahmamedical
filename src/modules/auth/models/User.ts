import { Model, DataTypes, Optional } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../../../config/database';

export interface UserAttributes {
  id: number;
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'operator';
  isActive: boolean;
  lastLogin?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'isActive' | 'lastLogin' | 'createdAt' | 'updatedAt'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare name: string;
  declare email: string;
  declare password: string;
  declare role: 'admin' | 'operator';
  declare isActive: boolean;
  declare lastLogin: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Instance method to compare password securely
  public async comparePassword(candidatePassword: string): Promise<boolean> {
    const passwordHash = this.getDataValue('password') || this.password;
    if (!passwordHash) {
      return false;
    }
    return bcrypt.compare(candidatePassword, passwordHash);
  }

  // Remove password when serializing model to JSON
  public toJSON(): object {
    const values = Object.assign({}, this.get());
    delete values.password;
    return values;
  }
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
      set(val: string) {
        this.setDataValue('email', val.trim().toLowerCase());
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('admin', 'operator'),
      allowNull: false,
      defaultValue: 'admin',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (user: User) => {
        const plainPassword = user.getDataValue('password');
        // Only hash if not already a bcrypt hash
        if (plainPassword && !plainPassword.startsWith('$2a$') && !plainPassword.startsWith('$2b$')) {
          const salt = await bcrypt.genSalt(10);
          user.setDataValue('password', await bcrypt.hash(plainPassword, salt));
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed('password')) {
          const plainPassword = user.getDataValue('password');
          // Only hash if not already a bcrypt hash
          if (plainPassword && !plainPassword.startsWith('$2a$') && !plainPassword.startsWith('$2b$')) {
            const salt = await bcrypt.genSalt(10);
            user.setDataValue('password', await bcrypt.hash(plainPassword, salt));
          }
        }
      },
    },
  }
);
