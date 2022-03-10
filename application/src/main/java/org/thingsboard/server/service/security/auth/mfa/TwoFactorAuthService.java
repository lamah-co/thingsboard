/**
 * Copyright © 2016-2022 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.service.security.auth.mfa;

import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.thingsboard.common.util.JacksonUtil;
import org.thingsboard.common.util.TripleFunction;
import org.thingsboard.server.common.data.AdminSettings;
import org.thingsboard.server.common.data.DataConstants;
import org.thingsboard.server.common.data.User;
import org.thingsboard.server.common.data.exception.ThingsboardErrorCode;
import org.thingsboard.server.common.data.exception.ThingsboardException;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.id.UserId;
import org.thingsboard.server.common.data.kv.BaseAttributeKvEntry;
import org.thingsboard.server.common.data.kv.JsonDataEntry;
import org.thingsboard.server.dao.attributes.AttributesService;
import org.thingsboard.server.dao.service.ConstraintValidator;
import org.thingsboard.server.dao.settings.AdminSettingsService;
import org.thingsboard.server.dao.user.UserService;
import org.thingsboard.server.service.security.auth.mfa.config.TwoFactorAuthSettings;
import org.thingsboard.server.service.security.auth.mfa.config.account.TwoFactorAuthAccountConfig;
import org.thingsboard.server.service.security.auth.mfa.config.provider.TwoFactorAuthProviderConfig;
import org.thingsboard.server.service.security.auth.mfa.provider.TwoFactorAuthProvider;
import org.thingsboard.server.service.security.auth.mfa.provider.TwoFactorAuthProviderType;

import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiConsumer;
import java.util.function.BiFunction;

@Service
@RequiredArgsConstructor
public class TwoFactorAuthService {

    private final UserService userService;
    private final AdminSettingsService adminSettingsService;
    private final AttributesService attributesService;
    private final Map<TwoFactorAuthProviderType, TwoFactorAuthProvider<?, ?>> providers = new EnumMap<>(TwoFactorAuthProviderType.class);

    protected static final String TWO_FACTOR_AUTH_ACCOUNT_CONFIG_KEY = "twoFaConfig";
    protected static final String TWO_FACTOR_AUTH_SETTINGS_KEY = "twoFaSettings";


    @Autowired
    private void setProviders(Collection<TwoFactorAuthProvider<?, ?>> providers) {
        providers.forEach(provider -> {
            this.providers.put(provider.getType(), provider);
        });
    }

    private <A extends TwoFactorAuthAccountConfig, C extends TwoFactorAuthProviderConfig> Optional<TwoFactorAuthProvider<C, A>> getTwoFaProvider(TwoFactorAuthProviderType providerType) {
        return Optional.of((TwoFactorAuthProvider<C, A>) providers.get(providerType));
    }

    private <C extends TwoFactorAuthProviderConfig> Optional<C> getTwoFaProviderConfig(TenantId tenantId, TwoFactorAuthProviderType providerType) {
        return getTwoFaSettings(tenantId)
                .flatMap(twoFaSettings -> twoFaSettings.getProviderConfig(providerType))
                .map(providerConfig -> (C) providerConfig);
    }


    public <R> R processByTwoFaProvider(TenantId tenantId, TwoFactorAuthProviderType providerType, BiFunction<TwoFactorAuthProvider<TwoFactorAuthProviderConfig, TwoFactorAuthAccountConfig>, TwoFactorAuthProviderConfig, R> function) throws ThingsboardException {
        TwoFactorAuthProviderConfig providerConfig = getTwoFaProviderConfig(tenantId, providerType)
                .orElseThrow(() -> new ThingsboardException("2FA provider is not configured", ThingsboardErrorCode.BAD_REQUEST_PARAMS));
        TwoFactorAuthProvider<TwoFactorAuthProviderConfig, TwoFactorAuthAccountConfig> provider = getTwoFaProvider(providerType)
                .orElseThrow(() -> new ThingsboardException("2FA provider is not available", ThingsboardErrorCode.ITEM_NOT_FOUND));

        return function.apply(provider, providerConfig);
    }

    public void processByTwoFaProvider(TenantId tenantId, TwoFactorAuthProviderType providerType, BiConsumer<TwoFactorAuthProvider<TwoFactorAuthProviderConfig, TwoFactorAuthAccountConfig>, TwoFactorAuthProviderConfig> function) throws ThingsboardException {
        processByTwoFaProvider(tenantId, providerType, (provider, providerConfig) -> {
            function.accept(provider, providerConfig);
            return null;
        });
    }

    public <R> R processByTwoFaProvider(TenantId tenantId, UserId userId, TripleFunction<TwoFactorAuthProvider<TwoFactorAuthProviderConfig, TwoFactorAuthAccountConfig>, TwoFactorAuthProviderConfig, TwoFactorAuthAccountConfig, R> function) throws ThingsboardException {
        TwoFactorAuthAccountConfig accountConfig = getTwoFaAccountConfig(tenantId, userId)
                .orElseThrow(() -> new ThingsboardException("2FA is not configured for user", ThingsboardErrorCode.BAD_REQUEST_PARAMS));

        TwoFactorAuthProviderConfig providerConfig = getTwoFaProviderConfig(tenantId, accountConfig.getProviderType())
                .orElseThrow(() -> new ThingsboardException("2FA provider is not configured", ThingsboardErrorCode.BAD_REQUEST_PARAMS));
        TwoFactorAuthProvider<TwoFactorAuthProviderConfig, TwoFactorAuthAccountConfig> provider = getTwoFaProvider(accountConfig.getProviderType())
                .orElseThrow(() -> new ThingsboardException("2FA provider is not available", ThingsboardErrorCode.ITEM_NOT_FOUND));

        return function.apply(provider, providerConfig, accountConfig);
    }


    public Optional<TwoFactorAuthAccountConfig> getTwoFaAccountConfig(TenantId tenantId, UserId userId) {
        User user = userService.findUserById(tenantId, userId);
        return Optional.ofNullable(user.getAdditionalInfo())
                .flatMap(additionalInfo -> Optional.ofNullable(additionalInfo.get(TWO_FACTOR_AUTH_ACCOUNT_CONFIG_KEY)).filter(jsonNode -> !jsonNode.isNull()))
                .map(jsonNode -> JacksonUtil.treeToValue(jsonNode, TwoFactorAuthAccountConfig.class))
                .filter(twoFactorAuthAccountConfig -> {
                    return getTwoFaProviderConfig(tenantId, twoFactorAuthAccountConfig.getProviderType()).isPresent();
                });
    }

    public void saveTwoFaAccountConfig(TenantId tenantId, UserId userId, TwoFactorAuthAccountConfig accountConfig) throws ThingsboardException {
        ConstraintValidator.validateFields(accountConfig);
        getTwoFaProviderConfig(tenantId, accountConfig.getProviderType())
                .orElseThrow(() -> new ThingsboardException("2FA provider is not configured", ThingsboardErrorCode.BAD_REQUEST_PARAMS));

        User user = userService.findUserById(tenantId, userId);
        ObjectNode additionalInfo = (ObjectNode) Optional.ofNullable(user.getAdditionalInfo())
                .orElseGet(JacksonUtil::newObjectNode);
        additionalInfo.set(TWO_FACTOR_AUTH_ACCOUNT_CONFIG_KEY, JacksonUtil.valueToTree(accountConfig));
        user.setAdditionalInfo(additionalInfo);

        userService.saveUser(user);
    }

    public void deleteTwoFaAccountConfig(TenantId tenantId, UserId userId) {
        User user = userService.findUserById(tenantId, userId);
        ObjectNode additionalInfo = (ObjectNode) Optional.ofNullable(user.getAdditionalInfo())
                .orElseGet(JacksonUtil::newObjectNode);
        additionalInfo.remove(TWO_FACTOR_AUTH_ACCOUNT_CONFIG_KEY);
        user.setAdditionalInfo(additionalInfo);

        userService.saveUser(user);
    }


    @SneakyThrows
    public Optional<TwoFactorAuthSettings> getTwoFaSettings(TenantId tenantId) {
        if (tenantId.equals(TenantId.SYS_TENANT_ID)) {
            return Optional.ofNullable(adminSettingsService.findAdminSettingsByKey(tenantId, TWO_FACTOR_AUTH_SETTINGS_KEY))
                    .map(adminSettings -> JacksonUtil.treeToValue(adminSettings.getJsonValue(), TwoFactorAuthSettings.class));
        } else {
            return attributesService.find(TenantId.SYS_TENANT_ID, tenantId, DataConstants.SERVER_SCOPE, TWO_FACTOR_AUTH_SETTINGS_KEY).get()
                    .map(adminSettingsAttribute -> JacksonUtil.fromString(adminSettingsAttribute.getJsonValue().get(), TwoFactorAuthSettings.class))
                    .filter(tenantTwoFactorAuthSettings -> !tenantTwoFactorAuthSettings.isUseSystemTwoFactorAuthSettings())
                    .or(() -> getTwoFaSettings(TenantId.SYS_TENANT_ID));
        }
    }

    @SneakyThrows
    public void saveTwoFaSettings(TenantId tenantId, TwoFactorAuthSettings twoFactorAuthSettings) {
        ConstraintValidator.validateFields(twoFactorAuthSettings);
        if (tenantId.equals(TenantId.SYS_TENANT_ID)) {
            AdminSettings settings = Optional.ofNullable(adminSettingsService.findAdminSettingsByKey(tenantId, TWO_FACTOR_AUTH_SETTINGS_KEY))
                    .orElseGet(() -> {
                        AdminSettings newSettings = new AdminSettings();
                        newSettings.setKey(TWO_FACTOR_AUTH_SETTINGS_KEY);
                        return newSettings;
                    });
            settings.setJsonValue(JacksonUtil.valueToTree(twoFactorAuthSettings));
            adminSettingsService.saveAdminSettings(tenantId, settings);
        } else {
            attributesService.save(TenantId.SYS_TENANT_ID, tenantId, DataConstants.SERVER_SCOPE, Collections.singletonList(
                    new BaseAttributeKvEntry(new JsonDataEntry(TWO_FACTOR_AUTH_SETTINGS_KEY, JacksonUtil.toString(twoFactorAuthSettings)), System.currentTimeMillis())
            )).get();
        }
    }

}
