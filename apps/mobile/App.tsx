import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { buildRecipeSuggestions, formatDaysLabel, normalizeDateInput } from '@appfridge/shared';
import type { RecipeSuggestion } from '@appfridge/shared';
import { addInventoryItem, fetchAiRecipes, fetchInventory, lookupProduct, registerPushToken, removeInventoryItem } from './src/api';
import { registerForPushNotificationsAsync } from './src/notifications';
import { styles } from './src/styles';
import type { InventoryResponseItem } from './src/types';

type LocationType = 'fridge' | 'freezer' | 'pantry';

export default function App() {
  const [inventory, setInventory] = useState<InventoryResponseItem[]>([]);
  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState<LocationType>('fridge');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [aiRecipes, setAiRecipes] = useState<RecipeSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadInventory();
    registerPushNotifications();
  }, []);

  async function registerPushNotifications() {
    const registration = await registerForPushNotificationsAsync();
    if (!registration) {
      return;
    }
    try {
      await registerPushToken(registration);
    } catch {
      // Backend may be offline during development.
    }
  }

  async function loadInventory() {
    try {
      const items = await fetchInventory();
      setInventory(items);
    } catch {
      Alert.alert('Бекенд недоступний', 'Запустіть сервер перед перевіркою мобільного застосунку.');
    }
  }

  async function handleLookup(targetBarcode?: string) {
    const code = (targetBarcode ?? barcode).trim();
    if (!code) {
      return;
    }

    setLoading(true);
    setBarcode(code);

    try {
      const product = await lookupProduct(code);
      setProductName(product.name);
      if (product.lookupStatus === 'fallback') {
        Alert.alert(
          'Товар не знайдено в каталозі',
          product.lookupMessage || 'Штрихкод не знайдено в онлайн-базі. Ви можете вручну відредагувати назву і все одно зберегти товар.'
        );
      }
    } catch {
      setProductName(`Товар ${code}`);
      Alert.alert(
        'Не вдалося отримати товар',
        'Або бекенд недоступний, або сталася мережева помилка. Ви можете вписати назву вручну і все одно зберегти продукт.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function requestScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      setScanning(result.granted);
      return;
    }

    setScanning(true);
  }

  async function handleAddItem() {
    if (!barcode || !productName || !expirationDate) {
      Alert.alert('Не вистачає даних', 'Потрібні штрихкод, назва і дата закінчення терміну придатності.');
      return;
    }

    const normalizedExpirationDate = normalizeDateInput(expirationDate);
    if (!normalizedExpirationDate) {
      Alert.alert('Невірна дата', 'Введіть дату у форматі YYYY-MM-DD або DD.MM.YYYY.');
      return;
    }

    try {
      const created = await addInventoryItem({
        barcode,
        name: productName,
        expirationDate: normalizedExpirationDate,
        quantity: Math.max(1, Number(quantity) || 1),
        location
      });

      setInventory((current) => [created, ...current]);
      setBarcode('');
      setProductName('');
      setExpirationDate('');
      setQuantity('1');
      setLocation('fridge');
    } catch {
      Alert.alert('Помилка', 'Не вдалося додати продукт у бекенд.');
    }
  }

  async function handleDeleteItem(id: string) {
    await removeInventoryItem(id);
    setInventory((current) => current.filter((item) => item.id !== id));
  }

  async function handleAiRecipes() {
    setAiLoading(true);
    try {
      const next = await fetchAiRecipes();
      setAiRecipes(next);
      if (next.length === 0) {
        Alert.alert('AI', 'Немає продуктів для контексту або модель повернула порожню відповідь. Додайте позиції в холодильник.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Невідома помилка';
      Alert.alert('AI помічник', msg);
    } finally {
      setAiLoading(false);
    }
  }

  const summary = useMemo(() => {
    return inventory.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.insight.status === 'expiring') {
          acc.expiring += 1;
        }
        if (item.insight.status === 'expired') {
          acc.expired += 1;
        }
        return acc;
      },
      { total: 0, expiring: 0, expired: 0 }
    );
  }, [inventory]);

  const recipes = buildRecipeSuggestions(inventory);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>AppFridge</Text>
          <Text style={styles.title}>Розумний холодильник за штрихкодом</Text>
          <Text style={styles.subtitle}>
            Звичайний штрихкод зазвичай визначає сам товар, але не містить дату придатності. Тому дату ви вводите вручну, а застосунок стежить за строками та надсилає нагадування.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Усього</Text>
              <Text style={styles.statValue}>{summary.total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Скоро</Text>
              <Text style={styles.statValue}>{summary.expiring}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Прострочено</Text>
              <Text style={styles.statValue}>{summary.expired}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Додати продукт</Text>
          <Text style={styles.sectionText}>Скануйте штрихкод, підтягніть товар, а потім вкажіть дату закінчення.</Text>

          <Pressable style={styles.button} onPress={requestScanner}>
            <Text style={styles.buttonText}>Відкрити сканер</Text>
          </Pressable>

          {scanning && permission?.granted && (
            <View style={styles.scannerBox}>
              <CameraView
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr']
                }}
                onBarcodeScanned={({ data }) => {
                  setScanning(false);
                  void handleLookup(data);
                }}
                style={{ flex: 1 }}
              />
            </View>
          )}

          {permission?.granted === false && <Text style={styles.scannerHint}>Потрібен доступ до камери.</Text>}

          <TextInput style={styles.input} placeholder="Штрихкод" placeholderTextColor="#7f95a3" value={barcode} onChangeText={setBarcode} />
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => handleLookup()} disabled={loading}>
            <Text style={styles.buttonTextLight}>{loading ? 'Пошук...' : 'Знайти товар'}</Text>
          </Pressable>
          <TextInput style={styles.input} placeholder="Назва товару" placeholderTextColor="#7f95a3" value={productName} onChangeText={setProductName} />
          <TextInput style={styles.input} placeholder="Дата придатності YYYY-MM-DD або DD.MM.YYYY" placeholderTextColor="#7f95a3" value={expirationDate} onChangeText={setExpirationDate} />
          <TextInput style={styles.input} placeholder="Кількість" placeholderTextColor="#7f95a3" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Місце: fridge/freezer/pantry" placeholderTextColor="#7f95a3" value={location} onChangeText={(value) => setLocation((value as LocationType) || 'fridge')} />

          <Pressable style={styles.button} onPress={handleAddItem}>
            <Text style={styles.buttonText}>Зберегти продукт</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Холодильник</Text>
          <Text style={styles.sectionText}>Список приходить із бекенду і вже відсортований за строком придатності.</Text>

          {inventory.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                item.insight.status === 'expired' ? styles.cardDanger : undefined,
                item.insight.status === 'expiring' ? styles.cardWarn : undefined
              ]}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {item.quantity} шт. · {item.location} · {item.expirationDate}
              </Text>
              {item.category ? <Text style={styles.cardMeta}>Категорія: {item.category}</Text> : null}
              <Text style={styles.status}>{formatDaysLabel(item.insight.daysLeft)}</Text>
              <Pressable onPress={() => void handleDeleteItem(item.id)}>
                <Text style={styles.removeText}>Видалити</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI помічник</Text>
          <Text style={styles.sectionText}>
            Рецепти з продуктів, у яких термін найближчий (до 7 днів або прострочено); решта лише як легкий допоміжний список. На сервері: OPENAI_API_KEY, AI_API_KEY або APIFREE_KEY (ключ формату sk-..., не PEXELS_KEY).
          </Text>
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void handleAiRecipes()} disabled={aiLoading}>
            <Text style={styles.buttonTextLight}>{aiLoading ? 'Генеруємо…' : 'Отримати AI-рецепти'}</Text>
          </Pressable>

          {aiRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.card}>
              <Text style={styles.recipeBadge}>AI</Text>
              <Text style={styles.recipeTitle}>{recipe.title}</Text>
              <Text style={styles.recipeBody}>{recipe.description}</Text>
              {recipe.ingredients.length > 0 ? (
                <Text style={[styles.recipeBody, { marginTop: 8 }]}>Інгредієнти: {recipe.ingredients.join(', ')}</Text>
              ) : null}
              {recipe.steps.map((step, index) => (
                <Text key={`${recipe.id}-step-${index}`} style={styles.recipeSteps}>
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Що приготувати (швидкі шаблони)</Text>
          <Text style={styles.sectionText}>Локальні підказки з продуктів, у яких строк закінчується найшвидше.</Text>

          {recipes.map((recipe) => (
            <View key={recipe.id} style={styles.card}>
              {recipe.source === 'rules' ? <Text style={styles.recipeBadge}>Шаблон</Text> : null}
              <Text style={styles.recipeTitle}>{recipe.title}</Text>
              <Text style={styles.recipeBody}>{recipe.description}</Text>
              {recipe.ingredients.length > 0 ? (
                <Text style={[styles.recipeBody, { marginTop: 8 }]}>Інгредієнти: {recipe.ingredients.join(', ')}</Text>
              ) : null}
              {recipe.steps.map((step, index) => (
                <Text key={`${recipe.id}-step-${index}`} style={styles.recipeSteps}>
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
