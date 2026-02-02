import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { ActiveWindowDetails } from '../../../../shared/types';

// Note: These tests perform live LLM API calls.
// Ensure GOOGLE_GENERATIVE_AI_API_KEY is set in your environment.

// Mock Mongoose models and their methods
const mockActiveWindowEventModel = {
  findOne: jest.fn(),
};
const mockCategoryModel = {
  findById: jest.fn(),
  find: jest.fn(),
};
const mockUserModel = {
  findById: jest.fn(),
};

// Use mock.module to replace the actual models with our mocks
mock.module('../../models/activeWindowEvent', () => ({
  ActiveWindowEventModel: mockActiveWindowEventModel,
}));
mock.module('../../models/category', () => ({
  CategoryModel: mockCategoryModel,
}));
mock.module('../../models/user', () => ({
  UserModel: mockUserModel,
}));

// Import the service AFTER mocks are set up
const { categorizeActivity } = await import('./categorizationService');
const { ActiveWindowEventModel } = await import('../../models/activeWindowEvent');
const { CategoryModel } = await import('../../models/category');
const { UserModel } = await import('../../models/user');

describe('categorizeActivity', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('LLM-based Categorization', () => {
    // Helper function to run LLM categorization tests
    const runLlmCategorizationTest = async ({
      activeWindow,
      mockUser,
      mockCategories,
      expectedCategoryName,
    }: {
      activeWindow: Pick<
        ActiveWindowDetails,
        'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'
      >;
      mockUser: any; // Using 'any' for mock user as its structure varies slightly in one test
      mockCategories: any[]; // Using 'any[]' for mock categories as it's a list of mock objects
      expectedCategoryName: string;
    }) => {
      // Arrange: Mock history check to fail, simulating the LLM pathway
      (ActiveWindowEventModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      // Arrange: Mock user and categories
      (UserModel.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser),
      });
      (CategoryModel.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockCategories),
      });

      // Act
      const result = await categorizeActivity(mockUserId, activeWindow);

      // Assert
      const expectedCategory = mockCategories.find((c) => c.name === expectedCategoryName);
      const receivedCategory = mockCategories.find((c) => c._id === result.categoryId);
      expect(receivedCategory?.name ?? 'Category Not Found').toBe(
        expectedCategory?.name ?? 'Expected Category Not Found'
      );
      expect(ActiveWindowEventModel.findOne).toHaveBeenCalledTimes(1);
      expect(UserModel.findById).toHaveBeenCalledWith(mockUserId);
      expect(CategoryModel.find).toHaveBeenCalledWith({
        userId: mockUserId,
        isArchived: { $ne: true },
      });
    };

    // --- Test Data ---
    const mockUserWithDatingSideProject = {
      userGoals: {
        dailyGoal: 'Scout for dream wife on Instagram etc',
        weeklyGoal: 'Go on a date and finish big work project',
        lifeGoal: 'Find my dream wife and build a successful company',
      },
    };

    const dreamWifeCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Find Dream Wife',
      description:
        'Look at Instagram profiles for potential dream wives, read about dating content to understand dating dynamics.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const socialMediaCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Social Media Distraction',
      description: 'Mindlessly scrolling social media.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const deepWorkCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Deep Work',
      description: 'Focused coding and development tasks.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const shallowWorkCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Shallow Work',
      description: 'Emails, slack, etc.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dreamWifeSeekingCategories = [dreamWifeCategory, socialMediaCategory, deepWorkCategory];

    const mockProductManagerUser = {
      userGoals: {
        dailyGoal:
          'build out initial smart distraction detection based on goal/tasks and current open window of user',
        weeklyGoal: 'Build novel productivity software that detects distractions',
        lifeGoal: 'build fast growing software startup that IPOs gets sold for more than $750m.',
      },
    };

    const productManagementCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Product Management',
      description: 'Contacting and interviewing potential users',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const productDevelopmentCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Product Development',
      description: 'Coding, debugging, and working on the application.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const distractionCategory = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: mockUserId,
      name: 'Distraction',
      description: 'Browsing social media without a specific work-related purpose.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const productManagerCategories = [
      productManagementCategory,
      productDevelopmentCategory,
      distractionCategory,
    ];

    test('should call the LLM and return a category when no history is found', async () => {
      const activeWindow = {
        ownerName: 'Code',
        title: 'Writing a new feature for an AI assistant',
        url: null,
        content:
          'function newFeature() { console.log("hello world"); } // working on a new feature',
        type: 'window' as const,
        browser: null,
      };

      await runLlmCategorizationTest({
        activeWindow,
        mockUser: {
          userGoals: {
            dailyGoal: 'Finish coding the new feature',
            weeklyGoal: 'Deploy v2',
            lifeGoal: 'Become a great developer',
          },
        },
        mockCategories: [deepWorkCategory, shallowWorkCategory],
        expectedCategoryName: deepWorkCategory.name,
      });
    }, 30000);

    // --- Find Dream Wife (odd side project) ---

    test('should categorize browsing a female Instagram profile as "Find Dream Wife"', async () => {
      const activeWindow = {
        ownerName: 'Google Chrome',
        title: 'Alana Silber (@alanasilber) • Instagram photos and videos',
        url: 'https://www.instagram.com/alanasilber/',
        content: null,
        type: 'browser' as const,
        browser: 'chrome' as const,
      };

      await runLlmCategorizationTest({
        activeWindow,
        mockUser: mockUserWithDatingSideProject,
        mockCategories: dreamWifeSeekingCategories,
        expectedCategoryName: dreamWifeCategory.name,
      });
    }, 30000);

    test('should categorize browsing a car Instagram profile as "Social Media Distraction"', async () => {
      const activeWindow = {
        ownerName: 'Google Chrome',
        title: 'CarsWithoutLimits (@carswithoutlimits) • Instagram photos and videos',
        url: 'https://www.instagram.com/carswithoutlimits/',
        content:
          'carswithoutlimits\nFollow\nMessage\n41,928 posts\n3.5M followers\n439 following\nCarsWithoutLimits\ncarswithoutlimits\nDigital creator\n🇨🇦| Welcome to the #1 Automotive Media Company.\n🌐| Car Meets, Exclusive Events, Industry News & Automotive Culture.\n📩|... \nmore\nhoo.be/carswithoutlimits\nPOSTS\nREELS\nTAGGED\nMeta\nAbout\nBlog\nJobs\nHelp\nAPI\nPrivacy\nConsumer Health Privacy\nTerms\nLocations\nInstagram Lite\nThreads\nContact uploading and non-users\nMeta Verified\nEnglish (UK)\nAfrikaans\nالعربية\nČeština\nDansk\nDeutsch\nΕλληνικά\nEnglish\nEnglish (UK)\nEspañol (España)\nEspañol\nفارسی\nSuomi\nFrançais\nעברית\nBahasa Indonesia\nItaliano\n日本語\n한국어\nBahasa Melayu\nNorsk\nNederlands\nPolski\nPortuguês (Brasil)\nPortuguês (Portugal)\nРусский\nSvenska\nภาษาไทย\nFilipino\nTürkçe\n中文(简体)\n中文(台灣)\nবাংলা\nગુજરાતી\nहिन्दी\nHrvatski\nMagyar\nಕನ್ನಡ\nമലയാളം\nमराठी\nनेपाली\nਪੰਜਾਬੀ\nසිංහල\nSlovenčina\nதமிழ்\nతెలుగు\nاردو\nTiếng Việt\n中文(香港)\nБългарски\nFrançais (Canada)\nRomână\nСрпски\nУкраїнська\n© 2025 Instagram from Meta\nHome\nSearch\nExplore\nReels\nMessages\nNotifications\nCreate\nProfile\nMeta AI\nAI Studio\n9+\nThreads\nMore',
        type: 'browser' as const,
        browser: 'chrome' as const,
      };
      await runLlmCategorizationTest({
        activeWindow,
        mockUser: mockUserWithDatingSideProject,
        mockCategories: dreamWifeSeekingCategories,
        expectedCategoryName: socialMediaCategory.name,
      });
    }, 30000);

    test('should categorize browsing a more OBVIOUSLY dating-related article as "Find Dream Wife" WITH content', async () => {
      const activeWindow = {
        ownerName: 'Google Chrome',
        title: '10 Ways to Find the Woman of Your Dreams - wikiHow',
        url: 'https://www.wikihow.com/Find-the-Woman-of-Your-Dreams',
        content:
          "\t\n\t\nPRO\nQUIZZES\nEDIT\nEXPLORE\nLOG IN\nRANDOM\nSkip to Content\nLOVETRUE LOVE\nHow to Find the Woman of Your Dreams\nDownload Article\nCo-authored by John Keegan\n\nLast Updated: April 25, 2025 References\n\nAre you waiting for that perfect dream girl to come into your life? While you may just bump into her if you're lucky, there are some ways to improve your chances at meeting a new partner. This article will help you out with some suggestions aimed at keeping things realistic.\n\n1\nDefine the woman of your dreams.\n\t\nDownload Article\nThink of key personality traits you consider important in a lifelong partner. You might be used to saying \"I want to find the woman of my dreams\" but you need to know what this means for you, such as what her personality is, what she likes/dislikes or even looks like.\nSome important qualities might be loyalty, generosity, fun-loving, outgoing, focused, and so forth.[1] Which of your own personality traits do you want matched?\nThink of the values you'd like this person to hold. Do you want her to have similar values to your own? Or, are you okay with her having quite different ones from you?\nConsider your faith or lack of it. Does your ideal woman need to be of the same faith? Also consider family values––what are yours and in what way must hers match those?\nWhat interests would you like this person to have? Does she have to have the same interests as you? Or would you prefer she had completely different interests, or a mixture of both? Is it enough that she's willing to learn about your interests?\nBe frank with yourself about appearance. How important a factor is this? Might it be holding you back from finding someone with an amazing personality?[2]\nBe a devil's advocate. What sort of things do you not want in your ideal partner? What would you be willing and not willing to compromise about?[3]\n2\nKeep...",
        type: 'browser' as const,
        browser: 'chrome' as const,
      };
      await runLlmCategorizationTest({
        activeWindow,
        mockUser: mockUserWithDatingSideProject,
        mockCategories: dreamWifeSeekingCategories,
        expectedCategoryName: dreamWifeCategory.name,
      });
    });

    // --- Product Management ---

    test('should categorize Twitter DM related to user interviews as "Product Management"', async () => {
      const twitterDMContent = readFileSync(
        path.join(__dirname, './twitterConvoTestData.txt'),
        'utf-8'
      );

      const activeWindow = {
        ownerName: 'Google Chrome',
        title: 'Jai Relan - Messages - Twitter',
        url: 'https://twitter.com/messages/123456-789012',
        content: twitterDMContent,
        type: 'browser' as const,
        browser: 'chrome' as const,
      };

      await runLlmCategorizationTest({
        activeWindow,
        mockUser: mockProductManagerUser,
        mockCategories: productManagerCategories,
        expectedCategoryName: productManagementCategory.name,
      });
    }, 30000);

    // --- Programming Tutorial part of Work ---

    test('should categorize programming tutorial on YouTube as "Work" (WITH content)', async () => {
      const activeWindow = {
        ownerName: 'Google Chrome',
        title: 'Getting started with C# for TypeScript Devs - YouTube',
        url: '(1) Getting started with C# for TypeScript Devs - YouTube',
        content:
          'Skip navigation\nCreate\n1\n>>\n1.00\n<<\n1:19 / 14:11\n•\nC Sharp Syntax First Look\nGetting started with C# for TypeScript Devs\nSyntax\n\n403K subscribers\nSubscribe\n305\nShare\nDownload\nClip\n6.1K views  11 months ago  #typescript #javascript #webdevelopment\nIn this video CJ shows how to get started with C# as a TypeScript / JavaScript web developer.\n\n00:00 Intro …\n...more\n\n \n \n \n ',
        type: 'browser' as const,
        browser: 'chrome' as const,
      };

      const workCategory = {
        _id: new mongoose.Types.ObjectId().toString(),
        userId: mockUserId,
        name: 'Work',
        description:
          'Writing/editing code, reading or watching coding tutorials, documentation, work-related articles, github repos, looking at AWS, deployment setups, google docs, Figma',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const distractionCategory = {
        _id: new mongoose.Types.ObjectId().toString(),
        userId: mockUserId,
        name: 'Distraction',
        description:
          'Looking at tasks and work-unrelated sites like scrolling social media, playing games, random googling, substacks (except if it is directly work-related)',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await runLlmCategorizationTest({
        activeWindow,
        mockUser: mockProductManagerUser,
        mockCategories: [workCategory, distractionCategory],
        expectedCategoryName: workCategory.name,
      });
    }, 30000);
  });
});
